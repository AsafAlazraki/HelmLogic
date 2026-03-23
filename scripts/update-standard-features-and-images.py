#!/usr/bin/env python3
"""
Update Highfield boat models in Firestore with:
1. standardFeatures - scraped from highfieldboats.com
2. variant imageUrl - color-matched top-down renders from highfieldboats.com

Usage: python3 scripts/update-standard-features-and-images.py [--dry-run]
"""

import json
import re
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

PROJECT_ID = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
DRY_RUN = "--dry-run" in sys.argv

VENDOR_ID = "LafOLpLb6QIFE856TiD4"

RANGE_ID_MAP = {
    "Classic": "qo7IePnRzJxjrYyLWhTn",
    "Sport":   "nQ2LE50z9Tbf2uss0Ote",
    "Patrol":  "vfXxDuMpChteKncb7LnG",
}

# Standard features per model (scraped from highfieldboats.com 2026-03-23)
# "ORCA® Hypalon or PVC tube" means both materials available
STANDARD_FEATURES = {
    # ─── CLASSIC RANGE ───────────────────────────────────────────────────────
    "CL260": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Bow locker (fits 24L fuel tank)",
        "Integrated transom supports",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Bow cushion",
        "Welded seams (PVC)",
        "Removable seat",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Tank strap kit",
        "Under seat bag",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "CL290": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Bow locker (fits 24L fuel tank)",
        "Integrated transom supports",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Bow cushion",
        "Welded seams (PVC)",
        "Removable seat",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Tank strap kit",
        "Under seat bag",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "CL310": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Bow locker (fits 24L fuel tank)",
        "Integrated transom supports",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Bow cushion",
        "Welded seams (PVC)",
        "Removable seat",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Tank strap kit",
        "Under seat bag",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "CL340": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Bow locker (fits 24L fuel tank)",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Bow cushion",
        "Welded seams (PVC)",
        "Removable seat",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Tank strap kit",
        "Under seat bag",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "CL360": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Bow locker (fits 24L fuel tank)",
        "Integrated transom supports",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Bow cushion",
        "Welded seams (PVC)",
        "Removable seat",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Tank strap kit",
        "Under seat bag",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "CL380": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Bow locker (fits 24L fuel tank)",
        "Integrated transom supports",
        "Lifting points and towing eyes",
        "Bow cushion",
        "Welded seams (PVC)",
        "Removable seat",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Tank strap kit",
        "Under seat bag",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "CL400": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Welded seams (PVC)",
        "Bow locker",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Electrical pack for boat & console",
        "FRP bow step & bow cushion",
    ],
    "CL420": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Welded seams (PVC)",
        "Bow locker",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Electrical pack for boat & console",
        "FRP bow step & bow cushion",
    ],
    "CL460": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Welded seams (PVC)",
        "Bow locker",
        "Tow bridle points",
        "Brushed foam teak finish deck",
        "Full length keel guard",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Electrical pack for boat & console",
        "FRP bow step & bow cushion",
    ],
    # ─── SPORT RANGE ─────────────────────────────────────────────────────────
    "SP300": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Integrated rear seat with cushion",
    ],
    "SP330": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
    ],
    "SP360": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
    ],
    "SP390": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
    ],
    "SP420": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
    ],
    "SP460": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Self-draining deck",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
        "Integrated rear seat with cushion",
    ],
    "SP520": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
    ],
    "SP560": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
        "Roll bar",
        "Cooler bag",
        "Sundeck",
    ],
    "SP660": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Hydraulic steering system & steering wheel",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Welded seams (PVC)",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
        "Roll bar",
        "Cooler bag",
        "Sundeck",
        "Shower kit",
    ],
    "SP700": [
        "ORCA® Hypalon",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Hydraulic steering system & steering wheel",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
        "Roll bar",
        "Cooler bag",
        "Sundeck",
        "Shower kit",
    ],
    "SP760": [
        "ORCA® Hypalon",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Hydraulic steering system & steering wheel",
        "Integrated transom supports",
        "Self-draining deck",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
        "Roll bar",
        "Sundeck",
        "Shower kit",
        "Fridge",
        "Table",
    ],
    "SP800": [
        "ORCA® Hypalon",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
        "Sundeck",
        "Shower kit",
        "Fridge",
        "Table",
        "T-Top",
        "Tow post",
        "Windlass",
    ],
    "SP900": [
        "ORCA® Hypalon",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Lifting points and towing eyes",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash for console",
        "Brushed foam teak finish deck",
        "Highfield dry bag",
        "Integrated rear seat with cushion",
        "Electrical pack for boat & console",
        "Platform with ladder",
        "Foot pump & repair kit",
        "Sundeck",
        "Shower kit",
        "Fridge",
        "Table",
        "T-Top",
        "Tow post",
        "Windlass",
    ],
    # ─── PATROL RANGE ────────────────────────────────────────────────────────
    "PA420": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Welded seams (PVC)",
        "Tow bridle points",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA460": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Welded seams (PVC)",
        "Tow bridle points",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA500": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Welded seams (PVC)",
        "Tow bridle points",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA540": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Welded seams (PVC)",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA600": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Welded seams (PVC)",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA660": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Foot pump, oars, repair kit",
    ],
    "PA700": [
        "ORCA® Hypalon or PVC tube",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Welded seams (PVC)",
        "Tow bridle points",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA760": [
        "ORCA® Hypalon",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
    "PA860": [
        "ORCA® Hypalon",
        "Flush mount non-return valves",
        "High tensile chromated & powder coated aluminum hull",
        "Integrated transom supports",
        "Self-draining deck",
        "Steering wheel",
        "Integrated under-deck fuel tank",
        "Lifting points and towing eyes",
        "Anti-slip deck",
        "Heavy duty rubbing strake",
        "Keel guard",
        "Carbon dash",
        "Electrical pack for boat & console",
        "Transom ladder",
        "Bow cushion",
        "Highfield dry bag",
        "Foot pump, oars, repair kit",
    ],
}

# Color-matched variant images scraped from highfieldboats.com
# Key: color code from variant doc, Value: image URL
# For 2-part color codes (e.g. CL260), the variant 3-part code is matched by first 2 parts
COLOR_IMAGES = {
    # Classic
    "CL260": {
        "B-G":    "https://www.highfieldboats.com/wp-content/uploads/2019/05/CL260-B-G-1.jpg",
        "DG-G":   "https://www.highfieldboats.com/wp-content/uploads/2019/05/CL260-DG-G.jpg",
        "LG-W":   "https://www.highfieldboats.com/wp-content/uploads/2019/05/CL260-LG-W.jpg",
        "W-W":    "https://www.highfieldboats.com/wp-content/uploads/2019/05/CL260-W-W-1.jpg",
    },
    "CL290": {
        "B-G-DG":  "https://www.highfieldboats.com/wp-content/uploads/2015/05/CL290B-G-DG1-2560x1440.jpg",
        "DG-G-DG": "https://www.highfieldboats.com/wp-content/uploads/2015/05/CL290DG-G-DG1-2560x1440.jpg",
        "LG-W-WD": "https://www.highfieldboats.com/wp-content/uploads/2015/05/CL290LG-W-WD1-2560x1440.jpg",
        "W-W-WD":  "https://www.highfieldboats.com/wp-content/uploads/2015/05/CL290W-W-WD1-2560x1440.jpg",
    },
    "CL400": {
        "B-G-DG":  "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-B-G-DG-1.jpg",
        "DG-G-DG": "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-DG-G-DG-2.jpg",
        "LG-W-WD": "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-LG-W-WD-1.jpg",
        "W-W-WD":  "https://www.highfieldboats.com/wp-content/uploads/2024/07/CL400-W-W-WD-1.jpg",
    },
    "CL420": {
        "B-G-DG":  "https://www.highfieldboats.com/wp-content/uploads/2020/08/CL420-B-G-DG.jpg",
        "DG-G-DG": "https://www.highfieldboats.com/wp-content/uploads/2020/08/CL420-DG-G-DG.jpg",
        "LG-W-WD": "https://www.highfieldboats.com/wp-content/uploads/2020/08/CL420-LG-W-WD.jpg",
        "W-W-WD":  "https://www.highfieldboats.com/wp-content/uploads/2020/08/CL420-W-W-WD-1.jpg",
    },
    # Sport
    "SP300": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（B-B-B）.jpg",
        "B-B-DB":  "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（B-B-DB）.jpg",
        "B-W-C":   "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（B-W-C.jpg",
        "DG-G-MB": "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（DG-G-MB）.jpg",
        "I-B-C":   "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（I-B-C）.jpg",
        "LG-W-DB": "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（LG-W-DB）.jpg",
        "LG-W-WB": "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（LG-W-WB）.jpg",
        "W-W-WB":  "https://www.highfieldboats.com/wp-content/uploads/2018/01/SP300（W-W-WB）.jpg",
    },
    "SP330": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-B-B-B.jpg",
        "B-B-DB":  "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-B-B-DB）.jpg",
        "B-W-C":   "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-B-W-C.jpg",
        "DG-G-MB": "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-DG-G-MB.jpg",
        "I-B-C":   "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-I-B-C）.jpg",
        "LG-W-WB": "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-LG-W-WB.jpg",
        "W-W-WB":  "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP330-W-W-WB-1.jpg",
    },
    "SP360": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360B-B-B.jpg",
        "B-B-DB":  "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360B-B-DB.jpg",
        "B-W-C":   "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360B-W-C.jpg",
        "DG-G-MB": "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360DG-G-MB.jpg",
        "I-B-C":   "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360I-B-C.jpg",
        "LG-W-DB": "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360LG-W-DB.jpg",
        "LG-W-WB": "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360LG-W-WB.jpg",
        "W-W-WB":  "https://www.highfieldboats.com/wp-content/uploads/2020/08/SP360W-W-WB-top-1.jpg",
    },
    "SP390": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-B-B-B.jpg",
        "B-B-DB":  "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-B-B-DB.jpg",
        "B-W-C":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-B-W-C.jpg",
        "DG-G-MB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-DG-G-MB.jpg",
        "I-B-C":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-I-B-C-.jpg",
        "LG-W-DB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-LG-W-DB.jpg",
        "LG-W-WB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-LG-W-WB.jpg",
        "W-W-WB":  "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP390-W-W-WB-t.jpg",
    },
    "SP420": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-B-B-B.jpg",
        "B-B-DB":  "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-B-B-DB.jpg",
        "B-W-C":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-B-W-C.jpg",
        "DG-G-MB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-DG-G-MB.jpg",
        "I-B-C":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-I-B-C-.jpg",
        "LG-W-DB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-LG-W-DB.jpg",
        "LG-W-WB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-LG-W-WB.jpg",
        "W-W-WB":  "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP420-W-W-WB-4.jpg",
    },
    "SP460": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-B-B-B.jpg",
        "B-B-DB":  "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-B-B-DB.jpg",
        "B-W-C":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-B-W-C.jpg",
        "DG-G-MB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-DG-W-MB.jpg",
        "I-B-C":   "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-I-B-C-.jpg",
        "LG-W-DB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-LG-W-DB.jpg",
        "LG-W-WB": "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-LG-W-WB.jpg",
        "W-W-WB":  "https://www.highfieldboats.com/wp-content/uploads/2015/10/SP460-W-W-WB-5.jpg",
    },
    # Patrol
    "PA420": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA420-B-B-B-1.jpg",
        "DG-G-DG": "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA420-DG-G-DG.jpg",
        "LG-W-DG": "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA420-LG-W-DG-3.jpg",
        "O-G-DG":  "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA420-O-G-DG.jpg",
        "R-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA420-R-B-B.jpg",
    },
    "PA460": {
        "B-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA460-B-B-B-1.jpg",
        "DG-G-DG": "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA460-DG-G-DG.jpg",
        "LG-W-DG": "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA460-LG-W-DG.jpg",
        "O-G-DG":  "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA460-O-G-DG.jpg",
        "R-B-B":   "https://www.highfieldboats.com/wp-content/uploads/2019/04/PA460-R-B-B.jpg",
    },
}

# Model slug mapping (same logic as seed script)
def model_to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def to_fs_val(val) -> dict:
    if val is None:
        return {"nullValue": None}
    elif isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, (int, float)):
        return {"doubleValue": float(val)}
    elif isinstance(val, str):
        return {"stringValue": val}
    elif isinstance(val, list):
        return {"arrayValue": {"values": [to_fs_val(v) for v in val]}}
    elif isinstance(val, dict):
        return {"mapValue": {"fields": {k: to_fs_val(v) for k, v in val.items() if v is not None}}}
    return {"stringValue": str(val)}


def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


def patch_doc(path: str, fields: dict, token: str) -> tuple[bool, str]:
    """PATCH only the specified fields on a Firestore document (updateMask)"""
    url = f"{FIRESTORE_BASE}/{path}"
    field_names = list(fields.keys())
    mask_param = "&".join(f"updateMask.fieldPaths={f}" for f in field_names)
    url_with_mask = f"{url}?{mask_param}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"fields": {k: to_fs_val(v) for k, v in fields.items()}}

    for attempt in range(3):
        try:
            resp = requests.patch(url_with_mask, headers=headers, json=body, timeout=20)
            if resp.status_code == 200:
                return True, path
            elif resp.status_code == 404:
                return False, f"NOT FOUND: {path}"
            else:
                if attempt == 2:
                    return False, f"ERROR {resp.status_code} on {path}: {resp.text[:200]}"
                time.sleep(2 ** attempt)
        except Exception as e:
            if attempt == 2:
                return False, f"EXCEPTION on {path}: {e}"
            time.sleep(2 ** attempt)
    return False, f"FAILED: {path}"


def get_variants(model_path: str, token: str) -> list[dict]:
    """Get all variant documents for a model"""
    url = f"{FIRESTORE_BASE}/{model_path}/variants"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=15)
    if resp.status_code != 200:
        return []
    data = resp.json()
    docs = data.get("documents", [])
    result = []
    for doc in docs:
        fields = doc.get("fields", {})
        sku = fields.get("sku", {}).get("stringValue", "")
        color_code = fields.get("colorCode", {}).get("stringValue", "")
        doc_path = doc["name"].split("/documents/")[1]
        result.append({"sku": sku, "colorCode": color_code, "path": doc_path})
    return result


def find_image_for_variant(model_code: str, color_code: str) -> str | None:
    """Find color-matched image URL for a variant"""
    model_imgs = COLOR_IMAGES.get(model_code, {})
    if not model_imgs:
        return None

    # Try exact match first
    if color_code in model_imgs:
        return model_imgs[color_code]

    # Try matching first 2 parts (e.g., "B-G-DG" → "B-G")
    parts = color_code.split("-")
    if len(parts) >= 2:
        two_part = f"{parts[0]}-{parts[1]}"
        if two_part in model_imgs:
            return model_imgs[two_part]

    # Try matching first part only (rare)
    if parts[0] in model_imgs:
        return model_imgs[parts[0]]

    return None


def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Updating standardFeatures + variant imageUrls")
    print(f"Models to update: {len(STANDARD_FEATURES)}")

    token = get_auth_token()
    print("Authenticated\n")

    stats = {"model_ok": 0, "model_err": 0, "variant_ok": 0, "variant_err": 0, "variant_skip": 0}

    for model_code, features in STANDARD_FEATURES.items():
        # Determine range
        if model_code.startswith("CL"):
            range_name = "Classic"
        elif model_code.startswith("SP"):
            range_name = "Sport"
        elif model_code.startswith("PA"):
            range_name = "Patrol"
        else:
            print(f"  SKIP {model_code}: unknown range")
            continue

        range_id = RANGE_ID_MAP[range_name]
        model_slug = model_to_slug(model_code)
        model_path = f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{model_slug}"

        print(f"\n{model_code} ({model_slug})")
        print(f"  Path: {model_path}")
        print(f"  Features: {len(features)}")

        if DRY_RUN:
            print(f"  [DRY RUN] Would patch standardFeatures")
        else:
            ok, msg = patch_doc(model_path, {"standardFeatures": features}, token)
            if ok:
                stats["model_ok"] += 1
                print(f"  ✓ standardFeatures updated")
            else:
                stats["model_err"] += 1
                print(f"  ✗ {msg}")
                continue

        # Update variant images
        if DRY_RUN:
            print(f"  [DRY RUN] Would fetch and update variants")
            continue

        variants = get_variants(model_path, token)
        print(f"  Variants found: {len(variants)}")

        for v in variants:
            color_code = v["colorCode"]
            img_url = find_image_for_variant(model_code, color_code)

            if img_url:
                ok, msg = patch_doc(v["path"], {"imageUrl": img_url}, token)
                if ok:
                    stats["variant_ok"] += 1
                    print(f"    ✓ {v['sku']} ({color_code}) → image set")
                else:
                    stats["variant_err"] += 1
                    print(f"    ✗ {v['sku']}: {msg}")
            else:
                stats["variant_skip"] += 1
                print(f"    - {v['sku']} ({color_code}) — no image available")

    print(f"\n{'=' * 50}")
    print("COMPLETE")
    print(f"  Models updated:      {stats['model_ok']}")
    print(f"  Models errored:      {stats['model_err']}")
    print(f"  Variants with image: {stats['variant_ok']}")
    print(f"  Variants skipped:    {stats['variant_skip']}")
    print(f"  Variant errors:      {stats['variant_err']}")


if __name__ == "__main__":
    main()
