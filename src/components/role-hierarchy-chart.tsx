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
  ReactFlowProvider,
  useReactFlow,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

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

// A more robust comparison function to prevent infinite loops
const areRolesEqual = (rolesA: Role[], rolesB: Role[]): boolean => {
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


const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 100;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Top;
    node.sourcePosition = Position.Bottom;
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  return { nodes, edges };
};


function RoleHierarchyChartInternal({ value, onChange }: RoleHierarchyChartProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();

  const nodeTypes = useMemo(() => ({ orgChartNode: OrgChartNode }), []);

  useEffect(() => {
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

    if (initialNodes.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      window.setTimeout(() => fitView(), 1);
    } else {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [value, fitView]);

  useEffect(() => {
    const newRoles = flowToRoles(nodes, edges);
    if (!areRolesEqual(newRoles, value || [])) {
        onChange(newRoles);
    }
  }, [nodes, edges, onChange, value]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      // Remove existing edge for the target to ensure only one parent
      setEdges((eds) => {
        const newEdges = eds.filter((e) => e.target !== connection.target);
        return addEdge({ ...connection, id: `e-${connection.source}-${connection.target}` }, newEdges);
      });
    },
    [setEdges]
  );

  const handleAddRole = () => {
    const newId = crypto.randomUUID();
    const newNode: Node = {
      id: newId,
      data: { label: 'New Role' },
      position: { x: 0, y: 0 },
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
