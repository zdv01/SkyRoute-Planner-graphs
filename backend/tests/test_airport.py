from backend.utils.utils import readJson
from backend.models.graph import Graph
from backend.models.vertex import Vertex
from backend.models.edge import Edge
from backend.models.airport import Airport
from pathlib import Path
import json

## ----------------------------------------------------------------
## ARCHIVO DE PRUEBA NO ES NECESARIO TRADUCRILO
## ----------------------------------------------------------------
# Cargar el JSON
route = Path(__file__).resolve().parent.parent / "data" / "archivo_principal.json"
data = readJson(route)

# Paso 1: Crear vértices a partir de los nodos
print("=" * 70)
print("PASO 1: CREANDO VÉRTICES DE NODOS")
print("=" * 70)

grafo = Graph()
vertices_map = {}  # Mapeo de id → Vertice para rápido acceso

for nodo in data["nodos"]:
    vertice = Vertex(nodo["id"])
    vertices_map[nodo["id"]] = vertice
    grafo.add_vertex(vertice)
    print(f"✓ Vértice creado: {nodo['id']} ({nodo['nombre']})")

print(f"\nTotal de vértices creados: {len(grafo.vertexes)}")

# Paso 2: Crear aristas y conectar los vértices
print("\n" + "=" * 70)
print("PASO 2: CREANDO Y CONECTANDO ARISTAS")
print("=" * 70)

for arista_data in data["aristas"]:
    origen_id = arista_data["origen"]
    destino_id = arista_data["destino"]

    # Obtener los vértices
    vertice_origen = vertices_map[origen_id]

    # Crear la arista con todos los datos del JSON
    arista = Edge(
        origin=origen_id,
        destination=destino_id,
        distanceKm=arista_data.get("distanciaKm", 0),
        aircrafts=arista_data.get("aeronaves", []),
        baseCost=arista_data.get("costoBase", 0),
        minimumStay=arista_data.get("estanciaMinima", 0),
    )

    # Agregar la arista al vértice de origen
    vertice_origen.add_adjacency(arista)
    print(
        f"✓ Arista conectada: {origen_id} -> {destino_id} ({arista_data['distanciaKm']}km)"
    )

print(f"\nTotal de aristas creadas: {sum(len(v.adjacencies) for v in grafo.vertexes)}")

# Paso 3: Visualizar y probar
print("\n" + "=" * 70)
print("INFORMACIÓN DEL GRAFO")
print("=" * 70)
grafo.print_graph()
"""
print("\n" + "=" * 70)
print("VISUALIZANDO GRAFO")
print("=" * 70)
grafo.visualize("Grafo de Rutas Aéreas")

"""

print("\n" + "=" * 70)
print("AEROPUERTOS")
print("=" * 70)
airports_list = [Airport.from_dict(nodo) for nodo in data["nodos"]]
print(json.dumps([a.to_dict() for a in airports_list], indent=4, ensure_ascii=False))
