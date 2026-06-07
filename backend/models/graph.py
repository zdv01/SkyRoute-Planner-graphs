import math
import random
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
        """
        Dijkstra shortest path. Skips blocked edges (R4 requirement).
        """
        all_vertex = [v.identifier for v in graph.vertexes]

        dist = {v: math.inf for v in all_vertex}
        pred = {v: None for v in all_vertex}
        dist[start_id] = 0
        not_visited = set(all_vertex)
        map_vertexes = {v.identifier: v for v in graph.vertexes}

        while not_visited:
            u = min(not_visited, key=lambda v: dist[v])
            if dist[u] == math.inf:
                break
            not_visited.remove(u)
            if u == destination_id:
                break

            current_vertex = map_vertexes[u]
            for edge in current_vertex.adjacencies:
                if getattr(edge, "is_blocked", False):   # R4: skip blocked routes
                    continue
                v = edge.destination.identifier
                if v in not_visited:
                    new_dist = dist[u] + edge.get_Weight()
                    if new_dist < dist[v]:
                        dist[v] = new_dist
                        pred[v] = u

        path = []
        current = destination_id
        while current is not None:
            path.insert(0, current)
            current = pred[current]

        if not path or path[0] != start_id:
            return dist, pred, []

        return dist, pred, path

    def breadthFirstSearch_traversal(self, graph, initial_vertex_id):
        get_id = [v.identifier for v in graph.vertexes]

        if initial_vertex_id not in get_id:
            return print("vertex not found")
        return self.__breadthFirstSearch(graph, initial_vertex_id)

    def __breadthFirstSearch(self, graph, initial_vertex_id):
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
        self.__depth_traversal(graph, initial_vertex_id, visited, result)

        return print(
            f"Depth range (by weight) starting at {initial_vertex_id}: {result}"
        )

    def __depth_traversal(self, graph, initial_vertex_id, visited, result):
        map_vertexes = {v.identifier: v for v in graph.vertexes}
        vertex = map_vertexes[initial_vertex_id]
        visited.add(initial_vertex_id)
        result.append(vertex.identifier)
        for edge in sorted(vertex.adjacencies, key=lambda e: e.get_Weight()):
            v_adyacent = edge.destination
            v_id = v_adyacent.identifier
            if v_id not in visited:
                self.__depth_traversal(graph, v_id, visited, result)

    def bellmanFord(self, graph, id_vInitial):
        # Get all the identifiers
        all_vertex = [v.identifier for v in graph.vertexes]
        # verify that exits "id_vInitial" in list[all_vertex]
        if id_vInitial not in all_vertex:
            return print(f"el vértice {id_vInitial} no esta en el grafo")
        # call internal funtion
        dist, pred = self.__bellmanFord(graph, id_vInitial, all_vertex)
        return print(f"distance: {dist}, predecessor:{pred}")

    def __bellmanFord(self, graph, id_vInitial, all_vertex):
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

        # for PRIM algorthm
        """
        convert a directed graph into an undirected or bidirectional one, 
        so that the weight works in both directions in order to execute the MST (PRIM) algorithm
        """

    def __convert_to_undirected(self, graph):
        undirected = {}
        for vertex in graph.vertexes:
            for edge in vertex.adjacencies:
                origin = vertex.identifier
                destination = edge.destination.identifier
                weight = edge.get_Weight()
                # unique key regardless of address
                key = tuple(sorted([origin, destination]))
                # keep min weight
                if key not in undirected:
                    undirected[key] = weight
                else:
                    undirected[key] = min(undirected[key], weight)
        return undirected

    def prim_traversal(self, graph, initial_vertex_id):
        # get all the identifiera
        ids = [v.identifier for v in graph.vertexes]
        # validate
        if initial_vertex_id not in ids:
            print(f"el vértice {initial_vertex_id} no esta en el grafo")
            return []
        # convert graph into undirected
        undirected_graph = self.__convert_to_undirected(graph)
        # call internal funtion
        result = self.__prim_traversal(undirected_graph, initial_vertex_id, ids)
        return print(f"Traversal prim(MST): {result}")

    def __prim_traversal(self, graph, id_vertex, ids):
        visited = set()
        visited.add(id_vertex)
        mst = []
        while len(visited) < len(ids):
            min_edge = None
            min_weight = float("inf")
            # traversal all edges
            for (u, v), weight in graph.items():
                # case 1:
                # u visited and v not visited
                if u in visited and v not in visited:
                    if weight < min_weight:
                        min_weight = weight
                        min_edge = (u, v, weight)
                # case 2:
                # v visited and u not visited
                elif v in visited and u not in visited:
                    if weight < min_weight:
                        min_weight = weight
                        min_edge = (v, u, weight)
            # if there is no connection
            if min_edge is None:
                print("el grafo no esta conectado")
                return mst
            # add edge in mst
            mst.append(min_edge)
            # mark new vertex
            visited.add(min_edge[1])
        return mst

    def ford_fulkerson(self, graph, initial_vertex_id, final_vertex_id):
        get_id = [v.identifier for v in graph.vertexes]
        if initial_vertex_id not in get_id:
            return print(f"El vértice {initial_vertex_id} no está en el grafo")
        if final_vertex_id not in get_id:
            return print(f"El vértice {final_vertex_id} no está en el grafo")
        max_flow = self.__ford_fulkerson(graph, initial_vertex_id, final_vertex_id)
        return print(
            f"ford fulkerson: Flujo máximo desde ({initial_vertex_id} ---> {final_vertex_id}): {max_flow}"
        )

    def __ford_fulkerson(self, graph, initial_vertex_id, final_vertex_id):
        # Create residual graph with capacities
        residual_graph = {}

        # Initialize residual capacities with original capacities
        for vertex in graph.vertexes:
            for edge in vertex.adjacencies:
                origin = vertex.identifier
                destination = edge.destination.identifier
                capacity = edge.get_Weight()

                key = (origin, destination)
                reverse_key = (destination, origin)

                if key not in residual_graph:
                    residual_graph[key] = capacity
                else:
                    residual_graph[key] = max(residual_graph[key], capacity)

                # Initialize reverse edge with 0 capacity
                if reverse_key not in residual_graph:
                    residual_graph[reverse_key] = 0

        max_flow = 0
        iteration = 0
        while True:
            iteration += 1
            visited = set()
            path = []

            # Search for augmenting path using DFS
            found = self.__dfs_find_path_residual(
                initial_vertex_id, final_vertex_id, visited, path, residual_graph
            )

            if not found:
                break

            # Find minimum capacity along the path (bottleneck)
            min_capacity = min(
                residual_graph[(path[i][0], path[i][1])] for i in range(len(path))
            )

            # Update residual capacities
            for u, v in path:
                residual_graph[(u, v)] -= min_capacity
                residual_graph[(v, u)] += min_capacity

            max_flow += min_capacity

        return max_flow

    def __dfs_find_path_residual(
        self, current_id, final_id, visited, path, residual_graph
    ):
        visited.add(current_id)

        if current_id == final_id:
            return True

        # Get all neighbors of current vertex
        neighbors = set()
        for (u, v), capacity in residual_graph.items():
            if u == current_id and capacity > 0:
                neighbors.add(v)

        for next_id in neighbors:
            if next_id not in visited:
                path.append((current_id, next_id))
                if self.__dfs_find_path_residual(
                    next_id, final_id, visited, path, residual_graph
                ):
                    return True
                path.pop()

        return False

    def dijkstra_multi_criteria(
        self, graph, start_id, destination_id, weight_function, allowed_vertices=None
    ):
        all_vertex = [v.identifier for v in graph.vertexes]

        # 1. Filter allowed vertices
        if allowed_vertices is not None:
            # FIX: Ensure origin and destination are always in the list,
            # otherwise it will raise KeyError on dist[start_id]
            if start_id not in allowed_vertices:
                allowed_vertices.add(start_id)
            if destination_id not in allowed_vertices:
                allowed_vertices.add(destination_id)

            all_vertex = [v for v in all_vertex if v in allowed_vertices]

        # If for any reason origin or destination are not in the graph
        if start_id not in all_vertex or destination_id not in all_vertex:
            return math.inf, []

        dist = {v: math.inf for v in all_vertex}
        pred = {v: None for v in all_vertex}
        dist[start_id] = 0

        not_visited = set(all_vertex)
        map_vertexes = {
            v.identifier: v for v in graph.vertexes if v.identifier in all_vertex
        }

        while not_visited:
            u = min(not_visited, key=lambda v: dist[v])
            if dist[u] == math.inf:
                break

            not_visited.remove(u)
            if u == destination_id:
                break

            current_vertex = map_vertexes[u]
            for edge in current_vertex.adjacencies:
                v = edge.destination.identifier
                if v in not_visited:
                    # Inject weight function
                    weight = weight_function(edge)
                    if weight == math.inf:  # Skip: invalid transport type
                        continue

                    new_dist = dist[u] + weight
                    if new_dist < dist[v]:
                        dist[v] = new_dist
                        pred[v] = u

        # FIX: Confirm the destination was actually reached
        if dist[destination_id] == math.inf:
            return math.inf, []

        path = []
        current = destination_id
        while current is not None:
            path.insert(0, current)
            current = pred[current]

        return dist[destination_id], path

    def find_itineraries_dfs(
        self,
        graph,
        start_id,
        budget_limit,
        time_limit_minutes,
        preferred_transports,
        constraint="both",
        aircraft_config=None,
        flight_overhead_min=0,
    ):
        _ac = aircraft_config or {}
        """
        constraint='budget' → only budget pruning (for Alt A)
        constraint='time'   → only time pruning   (for Alt B)
        constraint='both'   → both constraints simultaneously
        """
        all_paths = []
        start_vertex = next(
            (v for v in graph.vertexes if v.identifier == start_id), None
        )

        if not start_vertex:
            return all_paths

        def dfs(
            current_vertex,
            current_cost,
            current_time,
            visited_nodes,
            current_path,
            transports_seen,
            segments,
        ):
            all_paths.append(
                {
                    "path": list(current_path),
                    "cost": current_cost,
                    "time": current_time,  # stored in minutes
                    "destinations_count": len(set(current_path)) - 1,
                    "transports": set(transports_seen),
                    "segments": list(segments),
                }
            )

            for edge in current_vertex.adjacencies:
                next_node = edge.destination
                next_id = next_node.identifier

                if next_id in visited_nodes:
                    continue

                edge_transports = getattr(edge, "aircrafts", [])

                # Determine candidate transports for this edge
                if preferred_transports:
                    candidate_transports = [
                        t for t in edge_transports if t in preferred_transports
                    ]
                else:
                    candidate_transports = list(edge_transports)

                if not candidate_transports:
                    continue

                # Greedy: prefer a transport not yet used in the current path
                unseen = [t for t in candidate_transports if t not in transports_seen]
                matched_transport = unseen[0] if unseen else candidate_transports[0]

                dist_km = getattr(edge, "distanceKm", 0) or 0
                ac_cfg = _ac.get(matched_transport, {})
                flight_cost = 0 if getattr(edge, "routeSubsidized", False) else dist_km * ac_cfg.get("costoKm", 0)
                accommodation = getattr(next_node, "accommodationCost", 0) or 0
                alimentation = getattr(next_node, "alimentationCost", 0) or 0
                node_activities = getattr(next_node, "activities", []) or []
                sample = random.sample(node_activities, min(3, len(node_activities)))
                activities_cost = sum(getattr(a, "usdCost", 0) for a in sample)
                total_edge_cost = flight_cost + accommodation + alimentation + activities_cost
                # flight time: aircraft speed + fixed takeoff/landing overhead; then add minimum stay
                flight_time_min = dist_km * ac_cfg.get("tiempoKm", 0.1) + flight_overhead_min
                min_stay_min = getattr(edge, "minimumStay", 0) or 0
                edge_time = flight_time_min + min_stay_min

                # Prune only according to the active constraint
                if constraint == "budget":
                    if current_cost + total_edge_cost > budget_limit:
                        continue
                elif constraint == "time":
                    if current_time + edge_time > time_limit_minutes:
                        continue
                else:  # both
                    if (
                        current_cost + total_edge_cost > budget_limit
                        or current_time + edge_time > time_limit_minutes
                    ):
                        continue

                segment = {
                    "from": current_vertex.identifier,
                    "to": next_id,
                    "transport": matched_transport,
                    "flight_cost": flight_cost,
                    "accommodation_cost": accommodation,
                    "alimentation_cost": alimentation,
                    "activities_cost": activities_cost,
                    "cost": total_edge_cost,
                    "flight_time_minutes": flight_time_min,
                    "min_stay_minutes": min_stay_min,
                    "time_minutes": edge_time,
                }

                visited_nodes.add(next_id)
                current_path.append(next_id)
                transports_seen.append(matched_transport)
                segments.append(segment)

                dfs(
                    next_node,
                    current_cost + total_edge_cost,
                    current_time + edge_time,
                    visited_nodes,
                    current_path,
                    transports_seen,
                    segments,
                )

                visited_nodes.remove(next_id)
                current_path.pop()
                transports_seen.pop()
                segments.pop()

        dfs(start_vertex, 0, 0, {start_id}, [start_id], [], [])
        return all_paths
