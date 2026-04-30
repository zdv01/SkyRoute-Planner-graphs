class Arista:
    def __init__(
        self,
        origen,
        destino,
        distanciaKm=0,
        aeronaves=None,
        costoBase=0,
        estanciaMinima=0,
    ):
        self.origen = origen
        self.destino = destino
        self.distanciaKm = distanciaKm
        self.aeronaves = aeronaves if aeronaves is not None else []
        self.costoBase = costoBase
        self.estanciaMinima = estanciaMinima

    def to_dict(self):
        """Convierte la arista a un diccionario"""
        return {
            "origen": self.origen,
            "destino": self.destino,
            "distanciaKm": self.distanciaKm,
            "aeronaves": self.aeronaves,
            "costoBase": self.costoBase,
            "estanciaMinima": self.estanciaMinima,
        }

    @staticmethod
    def from_dict(data):
        """Crea una arista a partir de un diccionario"""
        return Arista(
            origen=data.get("origen"),
            destino=data.get("destino"),
            distanciaKm=data.get("distanciaKm", 0),
            aeronaves=data.get("aeronaves", []),
            costoBase=data.get("costoBase", 0),
            estanciaMinima=data.get("estanciaMinima", 0),
        )

    def get_weight(self):
        return self.distanciaKm

    def __repr__(self):
        return f"Arista({self.origen} -> {self.destino}, {self.distanciaKm}km)"
