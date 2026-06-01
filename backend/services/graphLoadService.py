import json
from models.graph import Graph
from models.Airport import Airport
from models.edge import Edge

class GraphLoadService:
    def __init__(self):
        self.graph = Graph()
        self.config = {}

    def load_from_json(self, json_data):
        """
        Parses JSON data to populate the Graph structure with Airport and Edge objects.
        """
        # Reset the graph instance for new loads
        self.graph = Graph()

        # Store global configuration (aircraft costs, time intervals, etc.)
        self.config = json_data.get("configuracion", {})

        # Temporary map for quick vertex lookup during edge creation
        airport_map = {}

        # 1. Instantiate Airports (Vertices)
        for node_data in json_data.get("nodos", []):
            airport = Airport.from_dict(node_data)
            self.graph.add_vertex(airport)
            airport_map[airport.identifier] = airport

        # 2. Instantiate Routes (Edges)
        for edge_data in json_data.get("aristas", []):
            origin_id = edge_data.get("origen")
            dest_id = edge_data.get("destino")

            if origin_id in airport_map and dest_id in airport_map:
                destination_vertex = airport_map[dest_id]

                new_edge = Edge(
                    origin=origin_id,
                    destination=destination_vertex,
                    distanceKm=edge_data.get("distanciaKm"),
                    aircrafts=edge_data.get("aeronaves"),
                    baseCost=edge_data.get("costoBase"),
                    minimumStay=edge_data.get("estanciaMinima"),
                )

                # Link edge to the origin vertex (Adjacency List)
                airport_map[origin_id].add_adjacency(new_edge)

        return self.graph

    def get_frontend_network_data(self):
        """
        Transforms the internal graph into a simplified structure for JS visualization.
        """
        nodes = []
        links = []

        for vertex in self.graph.vertexes:
            # Prepare node data (Frontend needs isHub for styling)
            nodes.append(
                {
                    "id": vertex.identifier,
                    "label": f"{vertex.identifier} - {vertex.city}",
                    "isHub": vertex.isHub,
                    "metadata": vertex.to_dict(),
                }
            )

            # Prepare edge data
            for edge in vertex.adjacencies:
                links.append(
                    {
                        "source": vertex.identifier,
                        "target": edge.destination.identifier,
                        "distance": edge.distanceKm,
                        "aircrafts": edge.aircrafts,
                        "isBlocked": edge.is_blocked,
                    }
                )

        return {"nodes": nodes, "links": links, "config": self.config}
