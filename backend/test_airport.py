from utils.utils import readJson
from models.airport import Aeropuerto
from pathlib import Path
from models.grafo import Grafo
from models.vertice import Vertice
from models.arista import Arista

# Cargar el JSON
route = (
    Path(__file__).resolve().parent.parent / "backend/data" / "archivo_principal.json"
)
data = readJson(route)

# Parsear los nodos como Aeropuerto
print("=" * 70)
print("PRUEBA DE PARSEO JSON A OBJETOS AEROPUERTO")
print("=" * 70)

aeropuertos = []
for arista in data["aristas"]:
    aeropuerto = Arista.from_dict(arista)
    aeropuertos.append(aeropuerto)
    print(aeropuerto)

print("\n" + "=" * 70)
print("RESUMEN")
print("=" * 70)
print(f"Total de aeropuertos parseados: {len(aeropuertos)}")
for ap in aeropuertos:
    print(f"  - {ap}")

# crear un grafo con los aeropuertos
grafo = Grafo()
for iata in aeropuertos:
    print(iata.identifier)
