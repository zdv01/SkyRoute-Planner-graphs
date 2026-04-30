import math
import networkx as nx
import matplotlib.pyplot as plt
from .arista import Arista
from .vertice import Vertice


class Grafo:
    def __init__(self):
        self.vertices = []

    def agregar_vertice(self, vertice):
        self.vertices.append(vertice)

    def imprimir_grafo(self):
        for v in self.vertices:
            print("***************************")
            print(v.identifier)
            for a in v.adjacencies:
                print(a.destino, a.get_Weight())
        print("-------------------------------------")
        print("-------------------------------------")

    def visualizar(self, titulo="Visualización del Grafo con NetworkX"):
        G_nx = nx.DiGraph()

        # Construir el grafo de networkx desde la estructura propia
        for v in self.vertices:
            for arista in v.adjacencies:
                G_nx.add_edge(
                    v.identifier,
                    arista.destino,
                    weight=arista.get_Weight(),
                )

        # Dibujar
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
        plt.title(titulo, fontsize=14)
        plt.show()

    def dijkstra_simple(self, grafo, inicio_id, destino_id):
        # Obtener todos los identificadores
        todos = [v.identifer for v in grafo.vertices]

        dist = {v: math.inf for v in todos}
        pred = {v: None for v in todos}
        dist[inicio_id] = 0

        no_visitados = set(todos)

        # Mapa de id → objeto Vertice para acceso rápido
        mapa_vertices = {v.identifier: v for v in grafo.vertices}

        print("=== Iteración inicial ===")
        for v in todos:
            print(f"{v}: ({'∞' if dist[v] == math.inf else dist[v]}, {pred[v]})")
        print()

        while no_visitados:
            # Elegir el vértice no visitado con menor distancia
            u = min(no_visitados, key=lambda v: dist[v])
            if dist[u] == math.inf:
                break

            print(f"Procesando vértice {u} con distancia {dist[u]}")
            no_visitados.remove(u)

            if u == destino_id:
                print(f"\nDestino {destino_id} alcanzado. Fin de la búsqueda.\n")
                break

            # Relajar aristas usando la estructura Arista
            vertice_actual = mapa_vertices[u]
            for arista in vertice_actual.adjacencies:
                v = arista.destino.identifier
                if v in no_visitados:
                    nueva_dist = dist[u] + arista.get_Weight()
                    if nueva_dist < dist[v]:
                        dist[v] = nueva_dist
                        pred[v] = u
                        print(
                            f"  Actualizado {v}: viene de {u}, nuevo costo = {nueva_dist}"
                        )

            print("\nEtiquetas actuales:")
            for v in todos:
                costo = "∞" if dist[v] == math.inf else dist[v]
                print(f"{v}: ({costo}, {pred[v]})")
            print()

        # Reconstruir camino más corto
        path = []
        actual = destino_id
        while actual is not None:
            path.insert(0, actual)
            actual = pred[actual]

        print(
            f"Camino más corto de {inicio_id} a {destino_id}: {' → '.join(str(n) for n in path)}"
        )
        print(f"Distancia total: {dist[destino_id]}")
        return dist, pred, path

    def recorrido_anchura(self, grafo, vertice_inicial):
        if vertice_inicial not in grafo.vertices:
            return print("Vertice inicial no encontrado")

        visitados = set()
        resultado = []
        cola_actual = [vertice_inicial]
        visitados.add(vertice_inicial.identifier)

        while cola_actual:
            cola_siguiente_dict = {}  # id -> (peso, vertice)

            # Procesar todos los vértices del nivel actual
            for vertice in cola_actual:
                resultado.append(vertice.identifier)

                # Recopila todos los vecinos del nivel actual
                for arista in vertice.adjacencies:
                    v_adyacente = arista.destino
                    v_id = v_adyacente.identifier
                    if v_id not in visitados:
                        peso = arista.get_Weight()
                        # Guardar solo el de menor peso si hay duplicados
                        if (
                            v_id not in cola_siguiente_dict
                            or peso < cola_siguiente_dict[v_id][0]
                        ):
                            cola_siguiente_dict[v_id] = (peso, v_adyacente)
                        visitados.add(v_id)

            # Ordenar el siguiente nivel por peso
            cola_siguiente = sorted(cola_siguiente_dict.values(), key=lambda x: x[0])
            cola_actual = [v for _, v in cola_siguiente]

        return print(
            f"Recorrido en anchura (por peso) iniciando en {vertice_inicial.identifier}: {' → '.join(resultado)}"
        )

    def visualizar_con_ruta(self, path, titulo="Ruta más corta - Dijkstra"):
        G_nx = nx.DiGraph()

        for v in self.vertices:
            for arista in v.adjacencies:
                G_nx.add_edge(
                    v.identificador,
                    arista.destino.identifier,
                    weight=arista.get_Weight(),
                )

        aristas_ruta = set(zip(path[:-1], path[1:]))

        edge_colors = [
            "red" if (u, v) in aristas_ruta else "#cccccc" for u, v in G_nx.edges()
        ]
        edge_widths = [3.5 if (u, v) in aristas_ruta else 1.0 for u, v in G_nx.edges()]
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

        # Dibujar nodos y aristas SIN etiquetas de nodo aún
        nx.draw(
            G_nx,
            pos,
            with_labels=False,  # <-- desactivado aquí
            node_color=node_colors,
            node_size=2000,
            arrows=True,
            arrowsize=20,
            edge_color=edge_colors,
            width=edge_widths,
            connectionstyle="arc3,rad=0.1",
        )  # <-- separa aristas bidireccionales

        # Etiquetas de nodos por separado con fondo blanco
        nx.draw_networkx_labels(
            G_nx,
            pos,
            font_size=12,
            font_weight="bold",
            bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="none", alpha=0.8),
        )

        # Etiquetas de aristas por separado con fondo blanco
        nx.draw_networkx_edge_labels(
            G_nx,
            pos,
            edge_labels=edge_labels,
            font_size=9,
            font_color="black",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.9),
            label_pos=0.35,
        )  # <-- aleja la etiqueta del centro

        from matplotlib.patches import Patch

        leyenda = [
            Patch(color="orange", label=f"Inicio ({path[0]})"),
            Patch(color="lightgreen", label=f"Destino ({path[-1]})"),
            Patch(color="#ff6b6b", label="Nodos en ruta"),
            Patch(color="skyblue", label="Otros nodos"),
        ]
        plt.legend(handles=leyenda, loc="upper left")
        plt.title(titulo, fontsize=14)
        plt.tight_layout()
        plt.show()


""""
grafo = Grafo()

verticeA = Vertice("A")
verticeB = Vertice("B")
verticeC = Vertice("C")
verticeD = Vertice("D")

verticeA.add_adjacency(Arista(verticeA, verticeB, 2))
verticeA.add_adjacency(Arista(verticeA, verticeC, 1))
verticeB.add_adjacency(Arista(verticeB, verticeD, 1))
verticeC.add_adjacency(Arista(verticeC, verticeD, 2))

grafo.agregar_vertice(verticeA)
grafo.agregar_vertice(verticeB)
grafo.agregar_vertice(verticeC)
grafo.agregar_vertice(verticeD)

grafo.imprimir_grafo()
grafo.visualizar("Grafo de prueba")

"""
