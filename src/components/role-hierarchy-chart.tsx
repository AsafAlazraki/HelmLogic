'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeChange,
  EdgeChange,
  Connection,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Button } from './ui/button';
import { PlusCircle } from 'lucide-react';
import OrgChartNode from './org-chart-node';
import { getLayoutedElements } from '@/lib/layout-utils';

export type Role = {
  id: string;
  name: string;
  parent: string;
};

type RoleHierarchyChartProps = {
  value: Role[];
  onChange: (roles: Role[]) => void;
};

const flowToRoles = (nodes: Node[], edges: Edge[]): Role[] => {
    return nodes.map(node => {
      const parentEdge = edges.find(edge => edge.target === node.id);
      return {
        id: node.id,
        name: node.data.label as string,
        parent: parentEdge ? parentEdge.source : '',
      };
    });
};

const areRolesEqual = (rolesA?: Role[], rolesB?: Role[]): boolean => {
    if (!rolesA || !rolesB) return rolesA === rolesB;
    if (rolesA.length !== rolesB.length) return false;

    const sortedA = [...rolesA].sort((a, b) => a.id.localeCompare(b.id));
    const sortedB = [...rolesB].sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 0; i < sortedA.length; i++) {
        const roleA = sortedA[i];
        const roleB = sortedB[i];
        if (roleA.id !== roleB.id || roleA.name !== roleB.name || roleA.parent !== roleB.parent) {
            return false;
        }
    }
    return true;
};

function RoleHierarchyChartInternal({ value, onChange }: RoleHierarchyChartProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView, getNodes, getEdges } = useReactFlow();
  const isInternalChange = useRef(false);
  const isSyncing = useRef(false);
  const userInteraction = useRef(false);

  const nodeTypes = useMemo(() => ({ orgChartNode: OrgChartNode }), []);

  // Forward declare attachCallbacks via a ref to break the dependency cycle
  const attachCallbacksRef = useRef<(node: Node) => Node>(n => n);

  const handleLabelChange = useCallback((id: string, newLabel: string) => {
    userInteraction.current = true;
    setNodes((nds) => nds.map((node) => {
        if (node.id === id) {
            return { ...node, data: { ...node.data, label: newLabel } };
        }
        return node;
    }));
  }, []);

  const handleDelete = useCallback((id: string) => {
      userInteraction.current = true;
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      
      const newNodes = currentNodes.filter(n => n.id !== id);
      const newEdges = currentEdges.filter(e => e.source !== id && e.target !== id);
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          newNodes,
          newEdges
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
  }, [getNodes, getEdges]);

  const handleAddChild = useCallback((id: string) => {
    userInteraction.current = true;
    const newId = `role-${Date.now()}-${Math.random()}`;
    const currentNodes = getNodes();
    const currentEdges = getEdges();

    let newNode: Node = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: 0, y: 0 },
      type: 'orgChartNode',
    };
    newNode = attachCallbacksRef.current(newNode);
    
    const newEdge = { id: `e-${id}-${newId}`, source: id, target: newId };
    
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      [...currentNodes, newNode],
      [...currentEdges, newEdge]
    );
    
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [getNodes, getEdges]);

  const handleAddParent = useCallback((id: string) => {
    userInteraction.current = true;
    const newId = `role-${Date.now()}-${Math.random()}`;
    const currentNodes = getNodes();
    const currentEdges = getEdges();

    let newNode: Node = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: 0, y: 0 },
      type: 'orgChartNode',
    };
    newNode = attachCallbacksRef.current(newNode);

    const newEdge = { id: `e-${newId}-${id}`, source: newId, target: id };
    const newEdges = currentEdges.filter((edge) => edge.target !== id).concat(newEdge);

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      [...currentNodes, newNode],
      newEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [getNodes, getEdges]);
  
  const handleAddRole = () => {
    userInteraction.current = true;
    const newId = `role-${Date.now()}-${Math.random()}`;
    let newNode: Node = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: 0, y: 0 },
      type: 'orgChartNode',
    };
    newNode = attachCallbacksRef.current(newNode);
    setNodes((nds) => [...nds, newNode]);
  };
  
  const attachCallbacks = useCallback((node: Node) => {
      return {
          ...node,
          data: {
              ...node.data,
              onLabelChange: (l: string) => handleLabelChange(node.id, l),
              onAddChild: () => handleAddChild(node.id),
              onAddParent: () => handleAddParent(node.id),
              onDelete: () => handleDelete(node.id),
          }
      };
  }, [handleLabelChange, handleAddChild, handleAddParent, handleDelete]);

  useEffect(() => {
    attachCallbacksRef.current = attachCallbacks;
  }, [attachCallbacks]);

  useEffect(() => {
    if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
    }

    isSyncing.current = true;

    const initialNodes: Node[] = (value || []).map((role) => ({
      id: role.id,
      data: { label: role.name },
      position: { x: 0, y: 0 },
      type: 'orgChartNode',
    }));
  
    const initialEdges: Edge[] = (value || [])
      .filter(role => role.parent)
      .map(role => ({
        id: `e-${role.parent}-${role.id}`,
        source: role.parent,
        target: role.id,
      }));

    const nodesWithCallbacks = initialNodes.map(attachCallbacks);

    if (nodesWithCallbacks.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodesWithCallbacks,
        initialEdges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      window.setTimeout(() => fitView(), 1);
    } else {
      setNodes(nodesWithCallbacks);
      setEdges(initialEdges);
    }
  }, [value, fitView, attachCallbacks]);

  useEffect(() => {
    if (userInteraction.current) {
        const newRoles = flowToRoles(nodes, edges);
        if (!areRolesEqual(newRoles, value)) {
            isInternalChange.current = true;
            onChange(newRoles);
        }
        userInteraction.current = false;
    } else if (isSyncing.current) {
        isSyncing.current = false;
    }
  }, [nodes, edges, onChange, value]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      userInteraction.current = true;
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      userInteraction.current = true;
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      userInteraction.current = true;
      setEdges((eds) => {
        const newEdges = eds.filter((e) => e.target !== connection.target);
        return addEdge({ ...connection, id: `e-${connection.source}-${connection.target}` }, newEdges);
      });
    },
    [setEdges]
  );

  return (
    <>
      <div style={{ height: '500px', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-secondary"
        >
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRole}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Role
        </Button>
      </div>
    </>
  );
}

export function RoleHierarchyChart(props: RoleHierarchyChartProps) {
    return (
        <ReactFlowProvider>
            <RoleHierarchyChartInternal {...props} />
        </ReactFlowProvider>
    )
}
