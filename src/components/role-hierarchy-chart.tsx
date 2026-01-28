'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Button } from './ui/button';
import { PlusCircle } from 'lucide-react';
import OrgChartNode from './org-chart-node';

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

const rolesToFlow = (roles: Role[]) => {
    const nodes: Node[] = roles.map((role, index) => ({
      id: role.id,
      data: { label: role.name },
      position: { x: (index % 4) * 200, y: Math.floor(index / 4) * 120 },
      type: 'orgChartNode',
    }));
  
    const edges: Edge[] = roles
      .filter(role => role.parent)
      .map(role => ({
        id: `e-${role.parent}-${role.id}`,
        source: role.parent,
        target: role.id,
      }));
    
    return { nodes, edges };
};

function RoleHierarchyChartInternal({ value, onChange }: RoleHierarchyChartProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { setViewport } = useReactFlow();

  const nodeTypes = useMemo(() => ({ orgChartNode: OrgChartNode }), []);

  useEffect(() => {
    const { nodes: initialNodes, edges: initialEdges } = rolesToFlow(value || []);
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [value]);

  useEffect(() => {
    const newRoles = flowToRoles(nodes, edges);
    const hasChanged = JSON.stringify(newRoles) !== JSON.stringify(value);
    if (hasChanged) {
        onChange(newRoles);
    }
  }, [nodes, edges, onChange, value]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge = { ...connection, id: `e-${connection.source}-${connection.target}` };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    []
  );

  const handleAddRole = () => {
    const newId = crypto.randomUUID();
    const newNode: Node = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: Math.random() * 200, y: Math.random() * 200 },
      type: 'orgChartNode',
    };
    setNodes((nds) => [...nds, newNode]);
  };

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
