import math
from .edge import Edge
from .vertex import Vertex


class Graph:
    def __init__(self):
        self.vertexes = []

    def add_vertex(self, vertex):
        self.vertexes.append(vertex)

    def print_graph(self):
        for v in self.vertexes:
            print("***************************")
            print(v.identifier)
            for a in v.adjacencies:
                print(a.destination.identifier, a.get_Weight())
        print("-------------------------------------")
        print("-------------------------------------")

    def dijkstra_simple(self, graph, start_id, destination_id):
        # Get all the identifiers
        all_vertex = [v.identifier for v in graph.vertexes]

        dist = {v: math.inf for v in all_vertex}
        pred = {v: None for v in all_vertex}
        dist[start_id] = 0

        not_visited = set(all_vertex)

        # Map ID → Vertex object for quick access
        map_vertexes = {v.identifier: v for v in graph.vertexes}

        print("=== Iteration initial ===")
        for v in all_vertex:
            print(f"{v}: ({'∞' if dist[v] == math.inf else dist[v]}, {pred[v]})")
        print()

        while not_visited:
            # Choose the unvisited vertex with the shortest distance
            u = min(not_visited, key=lambda v: dist[v])
            if dist[u] == math.inf:
                break

            print(f"Processing vertex {u} with distance {dist[u]}")
            not_visited.remove(u)

            if u == destination_id:
                print(f"\nDestination {destination_id} found. End of search.\n")
                break

            # Relax edges using the Edge structure
            current_vertex = map_vertexes[u]
            for edge in current_vertex.adjacencies:
                v_vertex = edge.destination
                v = v_vertex.identifier
                if v in not_visited:
                    new_dist = dist[u] + edge.get_Weight()
                    if new_dist < dist[v]:
                        dist[v] = new_dist
                        pred[v] = u
                        print(f"  Updated {v}: comes from {u}, new cost = {new_dist}")

            print("\nCurrent tags:")
            for v in all_vertex:
                cost = "∞" if dist[v] == math.inf else dist[v]
                print(f"{v}: ({cost}, {pred[v]})")
            print()

        # Rebuild shortest path
        path = []
        current = destination_id
        while current is not None:
            path.insert(0, current)
            current = pred[current]

        print(
            f"Path shorter than {start_id} a {destination_id}: {' → '.join(str(n) for n in path)}"
        )
        print(f"Total distance: {dist[destination_id]}")
        return dist, pred, path

    def breadthFirstSearch_traversal(self, graph, initial_vertex_id):
        get_id = [v.identifier for v in graph.vertexes]

        if initial_vertex_id not in get_id:
            return print("vertex not found")
        return self._breadthFirstSearch(graph, initial_vertex_id)

    def _breadthFirstSearch(self, graph, initial_vertex_id):
        map_vertexes = {v.identifier: v for v in graph.vertexes}
        visited = set()
        result = []
        # Convert initial vertex ID to vertex object
        initial_vertex = map_vertexes[initial_vertex_id]
        current_queue = [initial_vertex]
        visited.add(initial_vertex_id)
        while current_queue:
            next_queue = []
            next_queue_dict = {}  # id -> (weight, vertex)
            # Process all vertices in the current level
            for vertex in current_queue:
                result.append(vertex.identifier)
                sorted_edges = sorted(vertex.adjacencies, key=lambda e: e.get_Weight())
                # Collect all the neighbors from the current level
                for edge in sorted_edges:
                    v_adyacent = edge.destination
                    v_id = v_adyacent.identifier
                    if v_id not in visited and v_id not in next_queue_dict:
                        next_queue_dict[v_id] = v_adyacent
            # Sort the  level by weight
            next_queue = list(next_queue_dict.values())
            for v in next_queue:
                visited.add(v.identifier)
            current_queue = next_queue
        return print(
            f"Width range (by weight) starting at {initial_vertex_id}: {result}"
        )

    def depth_traversal(self, graph, initial_vertex_id):
        get_id = [v.identifier for v in graph.vertexes]
        visited = set()
        result = []
        if initial_vertex_id not in get_id:
            return print("vertex not found")
        self._depth_traversal(graph, initial_vertex_id, visited, result)

        return print(
            f"Depth range (by weight) starting at {initial_vertex_id}: {result}"
        )

    def _depth_traversal(self, graph, initial_vertex_id, visited, result):
        map_vertexes = {v.identifier: v for v in graph.vertexes}
        vertex = map_vertexes[initial_vertex_id]
        visited.add(initial_vertex_id)
        result.append(vertex.identifier)
        for edge in sorted(vertex.adjacencies, key=lambda e: e.get_Weight()):
            v_adyacent = edge.destination
            v_id = v_adyacent.identifier
            if v_id not in visited:
                self._depth_traversal(graph, v_id, visited, result)

    def bellmanFord(self, id_vInitial, graph):
        # Get all the identifiers
        all_vertex = [v.identifier for v in graph.vertexes]
        # verify that exits "id_vInitial" in list[all_vertex]
        if id_vInitial not in all_vertex:
            raise Exception(f"el vértice {id_vInitial} no esta en el grafo")
        dist = {v: math.inf for v in all_vertex}
        pred = {v: None for v in all_vertex}
        dist[id_vInitial] = 0

        # Create list of tuples
        list_tuples = []
        # Add adjacencies in list of tuples
        for vertex in graph.vertexes:
            for edges in vertex.adjacencies:
                origin = vertex.identifier
                destination = edges.destination.identifier
                weight = edges.get_Weight()
                list_tuples.append((origin, destination, weight))

        for _ in range(len(all_vertex) - 1):
            for o, d, w in list_tuples:
                if dist[o] + w < dist[d]:
                    dist[d] = dist[o] + w
                    pred[d] = o
        return dist, pred


graph = Graph()

verticeA = Vertex("A")
verticeB = Vertex("B")
verticeC = Vertex("C")
verticeD = Vertex("D")
verticeE = Vertex("E")
verticeF = Vertex("F")
verticeG = Vertex("G")
verticeH = Vertex("H")
verticeI = Vertex("I")

verticeA.add_adjacency(Edge(verticeA, verticeB, 2))
verticeA.add_adjacency(Edge(verticeA, verticeD, 3))
verticeA.add_adjacency(Edge(verticeA, verticeC, 4))
verticeB.add_adjacency(Edge(verticeB, verticeC, 5))
verticeB.add_adjacency(Edge(verticeB, verticeE, 11))
verticeC.add_adjacency(Edge(verticeC, verticeA, 4))
verticeC.add_adjacency(Edge(verticeC, verticeD, 2))
verticeC.add_adjacency(Edge(verticeC, verticeH, 6))
verticeC.add_adjacency(Edge(verticeC, verticeE, 5))
verticeD.add_adjacency(Edge(verticeD, verticeH, 1))
verticeE.add_adjacency(Edge(verticeE, verticeB, 11))
verticeE.add_adjacency(Edge(verticeE, verticeI, 12))
verticeF.add_adjacency(Edge(verticeF, verticeB, 9))
verticeF.add_adjacency(Edge(verticeF, verticeG, 8))
verticeG.add_adjacency(Edge(verticeG, verticeF, 8))
verticeH.add_adjacency(Edge(verticeH, verticeC, 6))
verticeI.add_adjacency(Edge(verticeI, verticeG, 9))

graph.add_vertex(verticeA)
graph.add_vertex(verticeB)
graph.add_vertex(verticeC)
graph.add_vertex(verticeD)
graph.add_vertex(verticeE)
graph.add_vertex(verticeF)
graph.add_vertex(verticeG)
graph.add_vertex(verticeH)
graph.add_vertex(verticeI)

graph.print_graph()
graph.breadthFirstSearch_traversal(graph, "A")
graph.depth_traversal(graph, "A")
graph.bellmanFord("A", graph)
print(graph.bellmanFord("A", graph))
