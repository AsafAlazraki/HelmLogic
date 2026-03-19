#!/usr/bin/env python3
"""
Comprehensive Highfield Boats reseed from 2026 Excel price lists.

Data source: parse_excel_data.py (reads directly from the Excel files)
This gives correct: variants with real USD prices, standardFeatures, and
optionalFeatures properly split into Consoles / Seats / Other.

Actions:
  1. Parse all data from Excel files via parse_excel_data.load_all()
  2. Delete orphan auto-ID model docs (len(id) >= 20, created by old seeding)
  3. Write/overwrite all slug-based model docs + variants

Usage:
  python3 scripts/reseed-from-excel.py [--dry-run] [--model CL260]
"""

import os
import re
import sys
import time
import requests
from typing import Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# Allow importing parse_excel_data from same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_excel_data import load_all

# ─── Config ──────────────────────────────────────────────────────────────────

PROJECT_ID = "studio-2290360004-3b963"
API_KEY    = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE  = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

DRY_RUN      = "--dry-run" in sys.argv
MODEL_FILTER = next((sys.argv[sys.argv.index("--model") + 1] for i, a in enumerate(sys.argv) if a == "--model"), None) if "--model" in sys.argv else None

VENDOR_ID = "LafOLpLb6QIFE856TiD4"

RANGE_IDS = {
    "Adventure":   "sEzdrM2fZsrOKA3ACrJp",
    "Classic":     "qo7IePnRzJxjrYyLWhTn",
    "Coaster":     "coaster",
    "Patrol":      "vfXxDuMpChteKncb7LnG",
    "Roll-Up":     "EqcKQ51svI1I2Q5poFdl",
    "Sport":       "nQ2LE50z9Tbf2uss0Ote",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j",
}

# ─── Model code → range + display name ───────────────────────────────────────

def model_to_range(code: str) -> Optional[str]:
    c = code.upper()
    if c.startswith("CL"):       return "Classic"
    if c.startswith("RU"):       return "Roll-Up"
    if c.startswith("UL"):       return "Ultra-Light"
    if c.startswith("SP"):       return "Sport"
    if c.startswith("ADV"):      return "Adventure"
    if c.startswith("PA"):       return "Patrol"
    if "COASTER" in c.upper():   return "Coaster"
    return None

# MAX models inherit std features from base model when Excel leaves them empty
STD_INHERIT = {
    "CL340MAX": "CL340",
    "CL360MAX": "CL360",
    "CL380MAX": "CL380",
}

DISPLAY_NAMES = {
    "SP700WL(Windlass)": "SP700 Windlass",
    "SP760WL(Windlass)": "SP760 Windlass",
    "PA540 open":        "PA540 Open",
    "PA600 open":        "PA600 Open",
    "Coaster 540 ST":    "Coaster 540 ST",
    "Coaster 540 open":  "Coaster 540 Open",
    "Coaster 600 ST":    "Coaster 600 ST",
    "RU250 Easy Go":     "RU250 Easy Go",
    "RU300 Easy Go":     "RU300 Easy Go",
}

def model_to_slug(code: str) -> str:
    slug = code.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")

def remap_category(cat: str) -> str:
    """Consoles and Seats are explicit; everything else → Other."""
    if cat in ("Consoles", "Seats"):
        return cat
    return "Other"

# ─── Specs database ──────────────────────────────────────────────────────────
# Source: Highfield Boats official website spec tables

SPECS = {
    # ── Classic ──────────────────────────────────────────────────────────────
    "CL260":    {"lengthMm": 2600, "beamMm": 1700, "internalLengthMm": 1760, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 58, "maxLoadKg": 360, "persons": 4, "maxHp": 10, "minHp": 2, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL290":    {"lengthMm": 2900, "beamMm": 1700, "internalLengthMm": 2060, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 66, "maxLoadKg": 480, "persons": 4, "maxHp": 15, "minHp": 5, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL290FT":  {"lengthMm": 2900, "beamMm": 1700, "internalLengthMm": 2060, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 66, "maxLoadKg": 480, "persons": 4, "maxHp": 15, "minHp": 5, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL310":    {"lengthMm": 3100, "beamMm": 1700, "internalLengthMm": 2260, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 69, "maxLoadKg": 550, "persons": 5, "maxHp": 20, "minHp": 5, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL310FT":  {"lengthMm": 3100, "beamMm": 1700, "internalLengthMm": 2260, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 69, "maxLoadKg": 550, "persons": 5, "maxHp": 20, "minHp": 5, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL310LS":  {"lengthMm": 3100, "beamMm": 1700, "internalLengthMm": 2260, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 69, "maxLoadKg": 550, "persons": 5, "maxHp": 20, "minHp": 5, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL340":    {"lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551, "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL340FT":  {"lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551, "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL340LS":  {"lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551, "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL340MAX": {"lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551, "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL360":    {"lengthMm": 3600, "beamMm": 1700, "internalLengthMm": 2670, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 80, "maxLoadKg": 561, "persons": 6, "maxHp": 30, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL360LS":  {"lengthMm": 3600, "beamMm": 1700, "internalLengthMm": 2670, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 80, "maxLoadKg": 561, "persons": 6, "maxHp": 30, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL360MAX": {"lengthMm": 3600, "beamMm": 1700, "internalLengthMm": 2670, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 80, "maxLoadKg": 561, "persons": 6, "maxHp": 30, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL380":    {"lengthMm": 3800, "beamMm": 1700, "internalLengthMm": 2870, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 84, "maxLoadKg": 637, "persons": 7, "maxHp": 30, "minHp": 15, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL380LS":  {"lengthMm": 3800, "beamMm": 1700, "internalLengthMm": 2870, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 84, "maxLoadKg": 637, "persons": 7, "maxHp": 30, "minHp": 15, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL380MAX": {"lengthMm": 3800, "beamMm": 1700, "internalLengthMm": 2870, "internalWidthMm": 790, "tubeOdMm": 440, "deadrise": 15, "weightKg": 84, "maxLoadKg": 637, "persons": 7, "maxHp": 30, "minHp": 15, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "CL400":    {"lengthMm": 4000, "beamMm": 1940, "internalLengthMm": 2900, "internalWidthMm": 900, "tubeOdMm": 490, "deadrise": 18, "weightKg": 150, "maxLoadKg": 793, "persons": 8, "maxHp": 60, "minHp": 25, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "CL420":    {"lengthMm": 4200, "beamMm": 1980, "internalLengthMm": 3000, "internalWidthMm": 930, "tubeOdMm": 490, "deadrise": 18, "weightKg": 185, "maxLoadKg": 884, "persons": 8, "maxHp": 80, "minHp": 30, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "CL460":    {"lengthMm": 4600, "beamMm": 2100, "internalLengthMm": 3300, "internalWidthMm": 980, "tubeOdMm": 520, "deadrise": 18, "weightKg": 230, "maxLoadKg": 1000, "persons": 10, "maxHp": 115, "minHp": 40, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    # ── Sport ─────────────────────────────────────────────────────────────────
    "SP300":    {"lengthMm": 3000, "beamMm": 1600, "tubeOdMm": 380, "deadrise": 18, "weightKg": 78, "maxLoadKg": 420, "persons": 4, "maxHp": 25, "minHp": 5, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "SP330":    {"lengthMm": 3300, "beamMm": 1700, "tubeOdMm": 400, "deadrise": 18, "weightKg": 95, "maxLoadKg": 490, "persons": 5, "maxHp": 30, "minHp": 10, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "SP360":    {"lengthMm": 3600, "beamMm": 1800, "tubeOdMm": 420, "deadrise": 18, "weightKg": 115, "maxLoadKg": 560, "persons": 6, "maxHp": 40, "minHp": 15, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "SP390":    {"lengthMm": 3900, "beamMm": 1900, "tubeOdMm": 440, "deadrise": 18, "weightKg": 130, "maxLoadKg": 640, "persons": 6, "maxHp": 60, "minHp": 20, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "SP420":    {"lengthMm": 4200, "beamMm": 2040, "tubeOdMm": 490, "deadrise": 18, "weightKg": 155, "maxLoadKg": 710, "persons": 7, "maxHp": 80, "minHp": 25, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "SP460":    {"lengthMm": 4600, "beamMm": 2100, "tubeOdMm": 500, "deadrise": 18, "weightKg": 195, "maxLoadKg": 820, "persons": 8, "maxHp": 115, "minHp": 40, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "SP520":    {"lengthMm": 5200, "beamMm": 2220, "tubeOdMm": 560, "deadrise": 20, "weightKg": 280, "maxLoadKg": 1050, "persons": 8, "maxHp": 150, "minHp": 60, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "SP560":    {"lengthMm": 5600, "beamMm": 2320, "tubeOdMm": 580, "deadrise": 20, "weightKg": 340, "maxLoadKg": 1180, "persons": 9, "maxHp": 200, "minHp": 80, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "SP600":    {"lengthMm": 6000, "beamMm": 2400, "tubeOdMm": 600, "deadrise": 20, "weightKg": 415, "maxLoadKg": 1300, "persons": 10, "maxHp": 250, "minHp": 100, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "SP660":    {"lengthMm": 6600, "beamMm": 2500, "tubeOdMm": 640, "deadrise": 20, "weightKg": 520, "maxLoadKg": 1550, "persons": 10, "maxHp": 300, "minHp": 115, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    "SP700ST":  {"lengthMm": 7000, "beamMm": 2600, "tubeOdMm": 680, "deadrise": 22, "weightKg": 650, "maxLoadKg": 1800, "persons": 10, "maxHp": 350, "minHp": 150, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    "SP800":    {"lengthMm": 8000, "beamMm": 2800, "tubeOdMm": 720, "deadrise": 22, "weightKg": 900, "maxLoadKg": 2200, "persons": 12, "maxHp": 500, "minHp": 200, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    "SP900":    {"lengthMm": 9000, "beamMm": 3000, "tubeOdMm": 760, "deadrise": 22, "weightKg": 1200, "maxLoadKg": 2800, "persons": 14, "maxHp": 700, "minHp": 250, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    # ── Patrol ────────────────────────────────────────────────────────────────
    "PA420":    {"lengthMm": 4200, "beamMm": 1980, "tubeOdMm": 500, "deadrise": 18, "weightKg": 235, "maxLoadKg": 850, "persons": 8, "maxHp": 80, "minHp": 25, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "PA460":    {"lengthMm": 4600, "beamMm": 2100, "tubeOdMm": 520, "deadrise": 18, "weightKg": 265, "maxLoadKg": 940, "persons": 9, "maxHp": 115, "minHp": 40, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "PA500":    {"lengthMm": 5000, "beamMm": 2180, "tubeOdMm": 540, "deadrise": 18, "weightKg": 320, "maxLoadKg": 1060, "persons": 10, "maxHp": 150, "minHp": 60, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "PA540ST":  {"lengthMm": 5400, "beamMm": 2280, "tubeOdMm": 560, "deadrise": 20, "weightKg": 390, "maxLoadKg": 1200, "persons": 10, "maxHp": 200, "minHp": 80, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "PA600ST":  {"lengthMm": 6000, "beamMm": 2400, "tubeOdMm": 600, "deadrise": 20, "weightKg": 490, "maxLoadKg": 1400, "persons": 10, "maxHp": 250, "minHp": 100, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "PA660ST":  {"lengthMm": 6600, "beamMm": 2520, "tubeOdMm": 640, "deadrise": 20, "weightKg": 610, "maxLoadKg": 1700, "persons": 12, "maxHp": 350, "minHp": 150, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    "PA700ST":  {"lengthMm": 7000, "beamMm": 2640, "tubeOdMm": 680, "deadrise": 22, "weightKg": 750, "maxLoadKg": 2000, "persons": 12, "maxHp": 400, "minHp": 175, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    "PA760ST":  {"lengthMm": 7600, "beamMm": 2760, "tubeOdMm": 710, "deadrise": 22, "weightKg": 880, "maxLoadKg": 2300, "persons": 14, "maxHp": 500, "minHp": 200, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    "PA860ST":  {"lengthMm": 8600, "beamMm": 2900, "tubeOdMm": 750, "deadrise": 22, "weightKg": 1100, "maxLoadKg": 2800, "persons": 14, "maxHp": 600, "minHp": 250, "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    # ── Roll-Up ───────────────────────────────────────────────────────────────
    "RU200AL":       {"lengthMm": 1990, "beamMm": 1390, "tubeOdMm": 360, "deadrise": None, "weightKg": 28, "maxLoadKg": 160, "persons": 2, "maxHp": 3.5, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU200KAM":      {"lengthMm": 1990, "beamMm": 1390, "tubeOdMm": 360, "deadrise": None, "weightKg": 28, "maxLoadKg": 160, "persons": 2, "maxHp": 3.5, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU230AL":       {"lengthMm": 2300, "beamMm": 1390, "tubeOdMm": None, "deadrise": None, "weightKg": 31, "maxLoadKg": 160, "persons": 2, "maxHp": 4, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU230KAM":      {"lengthMm": 2300, "beamMm": 1390, "tubeOdMm": None, "deadrise": None, "weightKg": 31, "maxLoadKg": 160, "persons": 2, "maxHp": 4, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU250AL":       {"lengthMm": 2520, "beamMm": 1580, "tubeOdMm": None, "deadrise": None, "weightKg": 37, "maxLoadKg": 240, "persons": 2, "maxHp": 6, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU250KAM":      {"lengthMm": 2520, "beamMm": 1580, "tubeOdMm": None, "deadrise": None, "weightKg": 37, "maxLoadKg": 240, "persons": 2, "maxHp": 6, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU250 Easy Go": {"lengthMm": 2500, "beamMm": 1560, "tubeOdMm": 420, "deadrise": None, "weightKg": 30, "maxLoadKg": 240, "persons": 3, "maxHp": 6, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU280AL":       {"lengthMm": 2800, "beamMm": 1610, "tubeOdMm": 430, "deadrise": None, "weightKg": 42, "maxLoadKg": 320, "persons": 4, "maxHp": 10, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU280KAM":      {"lengthMm": 2800, "beamMm": 1610, "tubeOdMm": 430, "deadrise": None, "weightKg": 42, "maxLoadKg": 320, "persons": 4, "maxHp": 10, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU300 Easy Go": {"lengthMm": 3000, "beamMm": 1560, "tubeOdMm": 420, "deadrise": None, "weightKg": 36, "maxLoadKg": 320, "persons": 4, "maxHp": 15, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU320AL":       {"lengthMm": 3200, "beamMm": 1610, "tubeOdMm": 430, "deadrise": None, "weightKg": 48, "maxLoadKg": 358, "persons": 5, "maxHp": 15, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    "RU320KAM":      {"lengthMm": 3200, "beamMm": 1610, "tubeOdMm": 430, "deadrise": None, "weightKg": 48, "maxLoadKg": 358, "persons": 5, "maxHp": 15, "minHp": None, "airChambers": 3, "isoCategory": None, "shaftType": "Short"},
    # ── Ultra-Light ───────────────────────────────────────────────────────────
    "UL220":   {"lengthMm": 2200, "beamMm": 1520, "tubeOdMm": 380, "deadrise": 10.5, "weightKg": 30, "maxLoadKg": 240, "persons": 3, "maxHp": 5,  "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "UL240":   {"lengthMm": 2400, "beamMm": 1540, "tubeOdMm": 380, "deadrise": 10.5, "weightKg": 33, "maxLoadKg": 240, "persons": 3, "maxHp": 6,  "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "UL240LT": {"lengthMm": 2400, "beamMm": 1540, "tubeOdMm": 380, "deadrise": 10.5, "weightKg": 33, "maxLoadKg": 240, "persons": 3, "maxHp": 6,  "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "UL260":   {"lengthMm": 2600, "beamMm": 1540, "tubeOdMm": 380, "deadrise": 10.5, "weightKg": 35, "maxLoadKg": 278, "persons": 4, "maxHp": 8,  "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "UL260LT": {"lengthMm": 2600, "beamMm": 1540, "tubeOdMm": 380, "deadrise": 10.5, "weightKg": 35, "maxLoadKg": 278, "persons": 4, "maxHp": 8,  "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "UL290":   {"lengthMm": 2900, "beamMm": 1540, "tubeOdMm": 380, "deadrise": 15.0, "weightKg": 39, "maxLoadKg": 320, "persons": 4, "maxHp": 15, "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "UL290LT": {"lengthMm": 2900, "beamMm": 1540, "tubeOdMm": 380, "deadrise": 15.0, "weightKg": 39, "maxLoadKg": 320, "persons": 4, "maxHp": 15, "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Long"},
    "UL310":   {"lengthMm": 3130, "beamMm": 1720, "tubeOdMm": 440, "deadrise": 15.0, "weightKg": 50, "maxLoadKg": 400, "persons": 5, "maxHp": 15, "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    "UL340":   {"lengthMm": 3370, "beamMm": 1720, "tubeOdMm": 440, "deadrise": 15.0, "weightKg": 53, "maxLoadKg": 438, "persons": 6, "maxHp": 20, "minHp": None, "airChambers": 3, "isoCategory": "C", "shaftType": "Short"},
    # ── Sport (missing) ───────────────────────────────────────────────────────
    "SP760ST":           {"lengthMm": 7770, "beamMm": 2950, "tubeOdMm": 580, "deadrise": 26, "weightKg": 1108, "maxLoadKg": 1280, "persons": 16, "maxHp": 300, "minHp": None, "airChambers": 6, "isoCategory": "C", "shaftType": "Long"},
    "SP760WL(Windlass)": {"lengthMm": 7770, "beamMm": 2950, "tubeOdMm": 580, "deadrise": 26, "weightKg": 1108, "maxLoadKg": 1280, "persons": 16, "maxHp": 300, "minHp": None, "airChambers": 6, "isoCategory": "C", "shaftType": "Long"},
    "SP700WL(Windlass)": {"lengthMm": 7000, "beamMm": 2600, "tubeOdMm": 680, "deadrise": 22, "weightKg": 650,  "maxLoadKg": 1800, "persons": 10, "maxHp": 350, "minHp": 150,  "airChambers": 3, "isoCategory": "B", "shaftType": "Long"},
    # ── Adventure ─────────────────────────────────────────────────────────────
    "ADV7": {"lengthMm": 6980, "beamMm": 2680, "tubeOdMm": 320, "deadrise": 20, "weightKg": 1300, "maxLoadKg": 640, "persons": 8, "maxHp": 300, "minHp": None, "airChambers": 6, "isoCategory": "C", "shaftType": "Long"},
    # ── Coaster ───────────────────────────────────────────────────────────────
    "Coaster 540 open": {"lengthMm": 5450, "beamMm": 2510, "tubeOdMm": 520, "deadrise": 24, "weightKg": 488, "maxLoadKg": 960,  "persons": 12, "maxHp": 115, "minHp": None, "airChambers": 6, "isoCategory": "C", "shaftType": "Long"},
    "Coaster 540 ST":   {"lengthMm": 5450, "beamMm": 2510, "tubeOdMm": 520, "deadrise": 24, "weightKg": 488, "maxLoadKg": 960,  "persons": 12, "maxHp": 115, "minHp": None, "airChambers": 6, "isoCategory": "C", "shaftType": "Long"},
    "Coaster 600 ST":   {"lengthMm": 6150, "beamMm": 2510, "tubeOdMm": 540, "deadrise": 26, "weightKg": 762, "maxLoadKg": 1200, "persons": 15, "maxHp": 150, "minHp": None, "airChambers": 6, "isoCategory": "C", "shaftType": "Long"},
}
# Mirror EW specs from ST for Patrol open/EW variants
for suffix_from, suffix_to in [("ST", "EW"), ("ST", " open")]:
    for code, s in list(SPECS.items()):
        if code.endswith(suffix_from):
            base = code[:-len(suffix_from)]
            new_code = base + suffix_to
            if new_code not in SPECS:
                SPECS[new_code] = dict(s)


def build_specifications(model_code: str) -> dict:
    s = SPECS.get(model_code)
    if not s:
        return {"motorConfigurations": [], "otherSpecs": []}
    raw_specs = [
        ("Overall Length",  f"{s['lengthMm']} mm"         if s.get("lengthMm")  else None),
        ("Overall Beam",    f"{s['beamMm']} mm"           if s.get("beamMm")    else None),
        ("Internal Length", f"{s['internalLengthMm']} mm" if s.get("internalLengthMm") else None),
        ("Internal Width",  f"{s['internalWidthMm']} mm"  if s.get("internalWidthMm")  else None),
        ("Tube Diameter",   f"{s['tubeOdMm']} mm"         if s.get("tubeOdMm")  else None),
        ("Deadrise",        f"{s['deadrise']}°"           if s.get("deadrise")  else None),
        ("Dry Weight",      f"{s['weightKg']} kg"         if s.get("weightKg")  else None),
        ("Max Load",        f"{s['maxLoadKg']} kg"        if s.get("maxLoadKg") else None),
        ("Persons",         str(s["persons"])              if s.get("persons")   else None),
        ("Air Chambers",    str(s["airChambers"])          if s.get("airChambers") else None),
        ("ISO Category",    s["isoCategory"]               if s.get("isoCategory") else None),
    ]
    other_specs = [{"key": k, "value": v} for k, v in raw_specs if v is not None]
    motor_config = {
        "id": "motor-0",
        "engines": [{"id": "engine-0", "minHp": s.get("minHp") or 0, "maxHp": s.get("maxHp") or 0}],
        "shaftType": s.get("shaftType", "Short"),
        "maxEngines": 1,
    }
    return {"motorConfigurations": [motor_config], "otherSpecs": other_specs}


# ─── Firestore helpers ────────────────────────────────────────────────────────

def to_fs_val(val: Any) -> dict:
    if val is None:
        return {"nullValue": None}
    if isinstance(val, bool):
        return {"booleanValue": val}
    if isinstance(val, (int, float)):
        return {"doubleValue": float(val)}
    if isinstance(val, str):
        return {"stringValue": val}
    if isinstance(val, list):
        return {"arrayValue": {"values": [to_fs_val(v) for v in val]}}
    if isinstance(val, dict):
        return {"mapValue": {"fields": {k: to_fs_val(v) for k, v in val.items() if v is not None}}}
    return {"stringValue": str(val)}


def to_fs_doc(data: dict) -> dict:
    return {"fields": {k: to_fs_val(v) for k, v in data.items() if v is not None}}


def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


class Writer:
    def __init__(self, token: str):
        self.token = token
        self.pending: list[tuple[str, dict]] = []
        self.total = 0
        self.errors = 0

    def add(self, path: str, data: dict):
        self.pending.append((path, data))
        if len(self.pending) >= 400:
            self.flush()

    def _write_one(self, path: str, data: dict) -> str:
        url = f"{FIRESTORE}/{path}"
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        for attempt in range(3):
            try:
                resp = requests.patch(url, headers=headers, json=to_fs_doc(data), timeout=20)
                if resp.status_code == 200:
                    return path
                elif resp.status_code == 401:
                    self.token = get_auth_token()
                    headers["Authorization"] = f"Bearer {self.token}"
                else:
                    if attempt == 2:
                        return f"ERROR {resp.status_code} on {path}: {resp.text[:120]}"
                    time.sleep(2 ** attempt)
            except Exception as e:
                if attempt == 2:
                    return f"EXCEPTION on {path}: {e}"
                time.sleep(2 ** attempt)
        return f"FAILED: {path}"

    def flush(self, workers: int = 20):
        if not self.pending:
            return
        batch = list(self.pending)
        self.pending.clear()
        if DRY_RUN:
            self.total += len(batch)
            return
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(self._write_one, p, d): p for p, d in batch}
            for future in as_completed(futures):
                result = future.result()
                if result.startswith(("ERROR", "EXCEPTION", "FAILED")):
                    print(f"  !! {result}")
                    self.errors += 1
                else:
                    self.total += 1


def delete_doc(token: str, path: str) -> bool:
    if DRY_RUN:
        print(f"  [DRY RUN] Would delete: {path}")
        return True
    url = f"{FIRESTORE}/{path}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.delete(url, headers=headers, timeout=15)
    return resp.status_code in (200, 204, 404)


def list_subcollection_ids(token: str, path: str) -> list[str]:
    """Return all document IDs in a Firestore collection path."""
    url = f"{FIRESTORE}/{path}"
    headers = {"Authorization": f"Bearer {token}"}
    docs = []
    page_token = None
    while True:
        params = {"pageSize": 300}
        if page_token:
            params["pageToken"] = page_token
        resp = requests.get(url, headers=headers, params=params, timeout=20)
        data = resp.json()
        for doc in data.get("documents", []):
            docs.append(doc["name"].split("/")[-1])
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return docs


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("Highfield Reseed — from 2026 Excel Price Lists")
    print(f"Vendor: {VENDOR_ID}")
    if DRY_RUN:
        print("MODE: DRY RUN — no writes")
    print("=" * 65)

    print("\nLoading Excel data...")
    boat_data = load_all()
    print(f"Parsed {len(boat_data)} models from Excel files")

    print("\nAuthenticating...")
    token = "dry-run" if DRY_RUN else get_auth_token()
    if not DRY_RUN:
        print(f"  Token: {token[:30]}...")

    writer = Writer(token)
    stats = {"models": 0, "variants": 0, "orphans_deleted": 0, "errors": 0}

    # Group by range
    by_range: dict[str, list[str]] = {}
    for model_code in boat_data:
        rng = model_to_range(model_code)
        if not rng:
            print(f"  WARN: no range for model_code={model_code!r}")
            continue
        by_range.setdefault(rng, []).append(model_code)

    for range_name, model_codes in sorted(by_range.items()):
        range_id = RANGE_IDS.get(range_name)
        if not range_id:
            print(f"\nSKIP: no range_id for {range_name}")
            continue

        print(f"\n── {range_name} (id={range_id}) — {len(model_codes)} models ──")

        # Find and delete orphan auto-ID docs (length >= 20 chars)
        existing_ids = list_subcollection_ids(token if not DRY_RUN else "dry", f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models")
        valid_slugs = {model_to_slug(mc) for mc in model_codes}
        orphan_ids = [did for did in existing_ids if len(did) >= 20 and did not in valid_slugs]
        if orphan_ids:
            print(f"  Deleting {len(orphan_ids)} orphan auto-ID docs...")
            for oid in orphan_ids:
                # Delete variants first
                var_ids = list_subcollection_ids(token if not DRY_RUN else "dry", f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{oid}/variants") if not DRY_RUN else []
                for vid in var_ids:
                    delete_doc(token, f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{oid}/variants/{vid}")
                ok = delete_doc(token, f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{oid}")
                if ok:
                    stats["orphans_deleted"] += 1
                    print(f"    deleted orphan: {oid}")

        for model_code in sorted(model_codes):
            if MODEL_FILTER and model_code.lower() != MODEL_FILTER.lower():
                continue

            data = boat_data[model_code]
            variants    = data["variants"]
            std_features = data["standardFeatures"]
            # Inherit standard features from parent model if empty
            if not std_features and model_code in STD_INHERIT:
                parent = STD_INHERIT[model_code]
                parent_data = boat_data.get(parent, {})
                std_features = parent_data.get("standardFeatures", [])
            opt_features = [
                {**f, "category": remap_category(f.get("category", "Other"))}
                for f in data["optionalFeatures"]
            ]

            slug = model_to_slug(model_code)
            display_name = DISPLAY_NAMES.get(model_code, model_code)
            specs = build_specifications(model_code)
            has_specs = bool(specs.get("motorConfigurations") or specs.get("otherSpecs"))

            prices = [v["sellPriceExclGst"] for v in variants if v.get("sellPriceExclGst")]
            base_price = min(prices) if prices else None
            materials = list({v["material"] for v in variants if v.get("material")})

            model_path = f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{slug}"
            model_doc = {
                "name":             display_name,
                "modelCode":        model_code,
                "slug":             slug,
                "rangeId":          range_id,
                "vendorId":         VENDOR_ID,
                "sellPriceExclGst": base_price,
                "standardFeatures": std_features,
                "optionalFeatures": opt_features,
                "specifications":   specs,
                "availableMaterials": materials,
            }
            writer.add(model_path, model_doc)
            stats["models"] += 1

            # Delete existing variants for this model and rewrite
            if not DRY_RUN:
                existing_var_ids = list_subcollection_ids(token, f"{model_path}/variants")
                for vid in existing_var_ids:
                    delete_doc(token, f"{model_path}/variants/{vid}")

            for v in variants:
                sku = v["sku"]
                variant_doc = {
                    "sku":               sku,
                    "name":              f"{display_name} — {v['colorName']}" if v.get("colorName") else display_name,
                    "material":          v.get("material", ""),
                    "colorCode":         v.get("colorCode", ""),
                    "colorName":         v.get("colorName", ""),
                    "cost":              v.get("cost"),
                    "sellPriceExclGst":  v.get("sellPriceExclGst"),
                }
                writer.add(f"{model_path}/variants/{sku}", variant_doc)
                stats["variants"] += 1

            consoles_count = sum(1 for f in opt_features if f.get("category") == "Consoles")
            seats_count = sum(1 for f in opt_features if f.get("category") == "Seats")
            other_count = sum(1 for f in opt_features if f.get("category") == "Other")
            spec_tag = "✓ specs" if has_specs else "— no specs"
            print(f"  + {model_code:22s} {len(variants):2d}v  std={len(std_features):2d}  "
                  f"cons={consoles_count} seat={seats_count} other={other_count}  {spec_tag}")

    writer.flush()

    print(f"\n{'=' * 65}")
    print("Done!")
    print(f"  Models written:    {stats['models']}")
    print(f"  Variants written:  {stats['variants']}")
    print(f"  Orphans deleted:   {stats['orphans_deleted']}")
    print(f"  Writer total:      {writer.total}")
    print(f"  Errors:            {writer.errors + stats['errors']}")


if __name__ == "__main__":
    main()
