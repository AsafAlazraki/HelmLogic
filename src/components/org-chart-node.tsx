'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useStoreApi } from 'reactflow';
import { Input } from './ui/input';

function OrgChartNode({ data, id }: NodeProps<{ label: string }>) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const { setNodes } = useReactFlow();
  const store = useStoreApi();

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    const { nodeInternals } = store.getState();
    setNodes(
      Array.from(nodeInternals.values()).map((node) => {
        if (node.id === id) {
          node.data = {
            ...node.data,
            label: label,
          };
        }
        return node;
      })
    );
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div onDoubleClick={handleDoubleClick} className="p-1 border rounded-md bg-card shadow-sm w-40 text-center">
      <Handle type="target" position={Position.Top} className="!bg-primary" />
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
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
}

export default React.memo(OrgChartNode);
