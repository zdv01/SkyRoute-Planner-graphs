from backend.utils.utils import readJson
from backend.models.graph import Graph
from backend.models.vertex import Vertex
from backend.models.edge import Edge
from backend.models.airport import Airport
from pathlib import Path
import json

# from backend.services.reportService import FinalReport

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
    vertice_destino = vertices_map[destino_id]

    # Crear la arista con todos los datos del JSON
    arista = Edge(
        origin=vertice_origen,
        destination=vertice_destino,
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

print("\n" + "=" * 70)
print("RECORRIDO EN ANCHURA")
print("=" * 70)
grafo.breadthFirstSearch_traversal(grafo, "MEX")

print("\n" + "=" * 70)
print("RECORRIDO EN PROFUNDIDAD")
print("=" * 70)
grafo.depth_traversal(grafo, "MEX")
grafo.dijkstra_simple(grafo, "BOG", "EZE")
""""
print("\n" + "=" * 70)
print("AEROPUERTOS")
print("=" * 70)
airports_list = [Airport.from_dict(nodo) for nodo in data["nodos"]]
print(json.dumps([a.to_dict() for a in airports_list], indent=4, ensure_ascii=False))

print("\n" + "=" * 70)
print("REPORTES")
print("=" * 70)
reportefinal = [
    {
        "destinosVisitados": {
            "nombreAeropuerto": "Aeropuerto Internacional Arturo Merino Benítez",
            "ciudad": "Santiago",
            "pais": "Chile",
            "tiempoEstancia": 6,
            "costoTotal": 4590,
        },
        "vuelosRecorridos": {
            "origen": "BOG",
            "destino": "SCL",
            "distanciaKm": 1880,
            "aeronaves": "Hélice",
            "costoTotal": 2390,
            "tiempoVuelo": 120,
        },
        "actividadesRealizadas": {
            "nombre": "tour de la ciudad",
            "tipo": "turismo",
            "duracionMin": 180,
            "costoUSD": 25,
        },
        "trabajosRealizados": {
            "nombre": "guia turistico",
            "horasTrabajadas": 6,
            "ingresoObtenido": 300,
        },
        "totales": {
            "presupuestiInicial": 10000,
            "totalGastado": 1000,
            "totalGanado": 345,
            "saldoFinal": 10000,
            "tiempoTotal": 6,
        },
    }
]

report = [FinalReport.from_dict(r) for r in reportefinal]
print(json.dumps([r.to_dict() for r in report], indent=4, ensure_ascii=False))

"""
