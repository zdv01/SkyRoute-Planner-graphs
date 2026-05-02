class Vertex:
    def __init__(self, identifier):
        self.identifier = identifier
        self.adjacencies = []

    def add_adjacency(self, edge):
        self.adjacencies.append(edge)
