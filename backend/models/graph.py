import math
import networkx as nx
import matplotlib.pyplot as plt
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
                print(a.destination, a.get_Weight())
        print("-------------------------------------")
        print("-------------------------------------")

    def visualize(self, title="Visualitation of Graph with NetworkX"):
        G_nx = nx.DiGraph()

        # Build the networkx graph from the existing structure
        for v in self.vertexes:
            for edge in v.adjacencies:
                G_nx.add_edge(
                    v.identifier,
                    edge.destination,
                    weight=edge.get_Weight(),
                )

        # Draw
        pos = nx.spring_layout(G_nx, seed=42)
        edge_labels = nx.get_edge_attributes(G_nx, "weight")

        plt.figure(figsize=(10, 7))
        nx.draw(
            G_nx,
            pos,
            with_labels=True,
            node_color="skyblue",
            node_size=1500,
            font_size=12,
            font_weight="bold",
            arrows=True,
        )
        nx.draw_networkx_edge_labels(
            G_nx, pos, edge_labels=edge_labels, font_color="red"
        )
        plt.title(title, fontsize=14)
        plt.show()

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
                v = edge.destination
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

    def recorrido_anchura(self, graph, initial_vertex):
        if initial_vertex not in graph.vertexes:
            return print("initial vertex not found")

        visited = set()
        result = []
        current_queue = [initial_vertex]
        visited.add(initial_vertex.identifier)

        while current_queue:
            next_queue_dict = {}  # id -> (weight, vertex)

            # Process all vertices in the current level
            for vertex in current_queue:
                result.append(vertex.identifier)

                # Collect all the neighbors from the current level
                for edge in vertex.adjacencies:
                    v_adyacent = edge.destination
                    v_id = v_adyacent.identifier
                    if v_id not in visited:
                        weight = edge.get_Weight()
                        # Save only the smallest file if there are duplicates
                        if (
                            v_id not in next_queue_dict
                            or weight < next_queue_dict[v_id][0]
                        ):
                            next_queue_dict[v_id] = (weight, v_adyacent)
                        visited.add(v_id)

            # Sort the next level by weight
            next_queue = sorted(next_queue_dict.values(), key=lambda x: x[0])
            current_queue = [v for _, v in next_queue]

        return print(
            f"Width range (by weight) starting at {initial_vertex.identifier}: {' → '.join(result)}"
        )

    def visualizar_con_ruta(self, path, title="Shortest route - Dijkstra"):
        G_nx = nx.DiGraph()

        for v in self.vertexes:
            for edge in v.adjacencies:
                G_nx.add_edge(
                    v.identifier,
                    edge.destination.identifier,
                    weight=edge.get_Weight(),
                )

        rute_edges = set(zip(path[:-1], path[1:]))

        edge_colors = [
            "red" if (u, v) in rute_edges else "#cccccc" for u, v in G_nx.edges()
        ]
        edge_widths = [3.5 if (u, v) in rute_edges else 1.0 for u, v in G_nx.edges()]
        node_colors = [
            (
                "orange"
                if n == path[0]
                else (
                    "lightgreen"
                    if n == path[-1]
                    else "#ff6b6b" if n in path else "skyblue"
                )
            )
            for n in G_nx.nodes()
        ]

        pos = nx.spring_layout(G_nx, seed=42)
        edge_labels = nx.get_edge_attributes(G_nx, "weight")

        plt.figure(figsize=(12, 8))

        # Draw nodes and edges WITHOUT node labels yet
        nx.draw(
            G_nx,
            pos,
            with_labels=False,  # <-- deactivated here
            node_color=node_colors,
            node_size=2000,
            arrows=True,
            arrowsize=20,
            edge_color=edge_colors,
            width=edge_widths,
            connectionstyle="arc3,rad=0.1",
        )  # <-- separates bidirectional edges

        # Separate node labels with white background
        nx.draw_networkx_labels(
            G_nx,
            pos,
            font_size=12,
            font_weight="bold",
            bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="none", alpha=0.8),
        )

        # Separate edge labels with white background
        nx.draw_networkx_edge_labels(
            G_nx,
            pos,
            edge_labels=edge_labels,
            font_size=9,
            font_color="black",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.9),
            label_pos=0.35,
        )  # <-- Move the label away from the center

        from matplotlib.patches import Patch

        leyend = [
            Patch(color="orange", label=f"Inicio ({path[0]})"),
            Patch(color="lightgreen", label=f"Destino ({path[-1]})"),
            Patch(color="#ff6b6b", label="Nodos en ruta"),
            Patch(color="skyblue", label="Otros nodos"),
        ]
        plt.legend(handles=leyend, loc="upper left")
        plt.title(title, fontsize=14)
        plt.tight_layout()
        plt.show()


"""
graph = Graph()

verticeA = Vertex("A")
verticeB = Vertex("B")
verticeC = Vertex("C")
verticeD = Vertex("D")

verticeA.add_adjacency(Edge(verticeA, verticeB, 2))
verticeA.add_adjacency(Edge(verticeA, verticeC, 1))
verticeB.add_adjacency(Edge(verticeB, verticeD, 1))
verticeC.add_adjacency(Edge(verticeC, verticeD, 2))

graph.add_vertex(verticeA)
graph.add_vertex(verticeB)
graph.add_vertex(verticeC)
graph.add_vertex(verticeD)

graph.print_graph()
graph.visualize("Grafo de prueba")

"""
