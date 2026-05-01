from utils.utils import readJson
from models.airport import Aeropuerto
from pathlib import Path
from models.grafo import Grafo
from models.vertice import Vertice
from models.arista import Arista

# Cargar el JSON
route = Path(__file__).resolve().parent / "data" / "archivo_principal.json"
data = readJson(route)

# Paso 1: Crear vértices a partir de los nodos
print("=" * 70)
print("PASO 1: CREANDO VÉRTICES DE NODOS")
print("=" * 70)

grafo = Grafo()
vertices_map = {}  # Mapeo de id → Vertice para rápido acceso

for nodo in data["nodos"]:
    vertice = Vertice(nodo["id"])
    vertices_map[nodo["id"]] = vertice
    grafo.agregar_vertice(vertice)
    print(f"✓ Vértice creado: {nodo['id']} ({nodo['nombre']})")

print(f"\nTotal de vértices creados: {len(grafo.vertices)}")

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
    arista = Arista(
        origen=origen_id,
        destino=destino_id,
        distanciaKm=arista_data.get("distanciaKm", 0),
        aeronaves=arista_data.get("aeronaves", []),
        costoBase=arista_data.get("costoBase", 0),
        estanciaMinima=arista_data.get("estanciaMinima", 0),
    )

    # Agregar la arista al vértice de origen
    vertice_origen.add_adjacency(arista)
    print(
        f"✓ Arista conectada: {origen_id} -> {destino_id} ({arista_data['distanciaKm']}km)"
    )

print(f"\nTotal de aristas creadas: {sum(len(v.adjacencies) for v in grafo.vertices)}")

# Paso 3: Visualizar y probar
print("\n" + "=" * 70)
print("INFORMACIÓN DEL GRAFO")
print("=" * 70)
grafo.imprimir_grafo()

print("\n" + "=" * 70)
print("VISUALIZANDO GRAFO")
print("=" * 70)
grafo.visualizar("Grafo de Rutas Aéreas")

print("\n" + "=" * 70)
print("PRUEBA DIJKSTRA: MDE → SCL")
print("=" * 70)
grafo.dijkstra_simple(grafo, "MDE", "SCL")
