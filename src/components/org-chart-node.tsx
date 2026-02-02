'use client';

import React, { useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Plus, Trash2 } from 'lucide-react';

type OrgChartNodeData = {
    label: string;
    onLabelChange?: (label: string) => void;
    onAddChild?: () => void;
    onAddParent?: () => void;
    onDelete?: () => void;
};

function OrgChartNode({ data, id }: NodeProps<OrgChartNodeData>) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (data.onLabelChange && label !== data.label) {
        data.onLabelChange(label);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div className="relative group">
        <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={data.onAddParent}
            className="absolute -top-5 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-card border border-primary text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
            <Plus className="h-4 w-4" />
        </Button>
      <div onDoubleClick={handleDoubleClick} className="p-1 border rounded-md bg-card shadow-sm w-40 text-center relative">
        <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={data.onDelete}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-card border border-destructive text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-20"
        >
            <Trash2 className="h-4 w-4" />
        </Button>
        <Handle type="target" position={Position.Top} className="!bg-primary z-10" />
        {isEditing ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full h-8 text-center"
          />
        ) : (
          <div className="p-2 text-card-foreground">{label}</div>
        )}
        <Handle type="source" position={Position.Bottom} className="!bg-primary z-10" />
      </div>
       <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={data.onAddChild}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-card border border-primary text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
            <Plus className="h-4 w-4" />
        </Button>
    </div>
  );
}

export default React.memo(OrgChartNode);
