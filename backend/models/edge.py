class Edge:
    def __init__(
        self,
        origin,
        destination,
        distanceKm=0,
        aircrafts=None,
        baseCost=0,
        minimumStay=0,
    ):
        self.origin = origin
        self.destination = destination
        self.distanceKm = distanceKm
        self.aircrafts = aircrafts if aircrafts is not None else []
        self.baseCost = baseCost
        self.minimumStay = minimumStay

    def to_dict(self):
        """to turn an edge into a dictionary"""
        return {
            "origen": self.origin,
            "destino": self.destination,
            "distanciaKm": self.distanceKm,
            "aeronaves": self.aircrafts,
            "costoBase": self.baseCost,
            "estanciaMinima": self.minimumStay,
        }

    @staticmethod
    def from_dict(data):
        """create an edge from a dictionary"""
        return Edge(
            origin=data.get("origen"),
            destination=data.get("destino"),
            distanceKm=data.get("distanciaKm", 0),
            aircrafts=data.get("aeronaves", []),
            baseCost=data.get("costoBase", 0),
            minimumStay=data.get("estanciaMinima", 0),
        )

    def get_Weight(self):
        return self.distanceKm

    def __repr__(self):
        return f"Edge({self.origin} -> {self.destination}, {self.distanceKm}km)"
