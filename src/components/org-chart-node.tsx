'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useStoreApi } from 'reactflow';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Plus } from 'lucide-react';

function OrgChartNode({ data, id, xPos, yPos }: NodeProps<{ label: string }>) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const { setNodes, addNodes, addEdges, setEdges } = useReactFlow();
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

  const handleAddChild = useCallback(() => {
    const newId = crypto.randomUUID();
    const newNode = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: xPos, y: yPos + 120 },
      type: 'orgChartNode',
    };
    const newEdge = { id: `e-${id}-${newId}`, source: id, target: newId };
    addNodes(newNode);
    addEdges(newEdge);
  }, [addNodes, addEdges, id, xPos, yPos]);

  const handleAddParent = useCallback(() => {
    const newId = crypto.randomUUID();
    const newNode = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: xPos, y: yPos - 120 },
      type: 'orgChartNode',
    };
    const newEdge = { id: `e-${newId}-${id}`, source: newId, target: id };

    setEdges((edges) => edges.filter((edge) => edge.target !== id).concat(newEdge));
    addNodes(newNode);
  }, [addNodes, setEdges, id, xPos, yPos]);


  return (
    <div className="relative group">
        <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleAddParent}
            className="absolute -top-5 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-card border border-primary text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
            <Plus className="h-4 w-4" />
        </Button>
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
       <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleAddChild}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-card border border-primary text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
            <Plus className="h-4 w-4" />
        </Button>
    </div>
  );
}

export default React.memo(OrgChartNode);
