'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { getLayoutedElements } from '@/lib/layout-utils';

function OrgChartNode({ data, id, xPos, yPos }: NodeProps<{ label: string }>) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const { setNodes, setEdges, deleteElements, getNodes, getEdges } = useReactFlow();

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setNodes((nodes) =>
      nodes.map((node) => {
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
      position: { x: 0, y: 0 },
      type: 'orgChartNode',
    };
    const newEdge = { id: `e-${id}-${newId}`, source: id, target: newId };
    
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      [...getNodes(), newNode],
      [...getEdges(), newEdge]
    );
    
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [id, getNodes, getEdges, setNodes, setEdges]);

  const handleAddParent = useCallback(() => {
    const newId = crypto.randomUUID();
    const newNode = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: 0, y: 0 },
      type: 'orgChartNode',
    };
    const newEdge = { id: `e-${newId}-${id}`, source: newId, target: id };

    const newEdges = getEdges().filter((edge) => edge.target !== id).concat(newEdge);

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      [...getNodes(), newNode],
      newEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [id, getNodes, getEdges, setNodes, setEdges]);
  
  const handleDelete = useCallback(() => {
    deleteElements({ nodes: [{ id }] });
  }, [id, deleteElements]);


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
      <div onDoubleClick={handleDoubleClick} className="p-1 border rounded-md bg-card shadow-sm w-40 text-center relative">
        <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleDelete}
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
            onClick={handleAddChild}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-card border border-primary text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
            <Plus className="h-4 w-4" />
        </Button>
    </div>
  );
}

export default React.memo(OrgChartNode);
