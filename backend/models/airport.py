from .vertice import Vertice


class Actividad:
    """Representa una actividad disponible en un aeropuerto"""

    def __init__(self, nombre, tipo, duracionMin, costoUSD):
        self.nombre = nombre
        self.tipo = tipo
        self.duracionMin = duracionMin
        self.costoUSD = costoUSD

    def __repr__(self):
        return f"Actividad({self.nombre}, {self.tipo}, {self.duracionMin}min, ${self.costoUSD})"

    @classmethod
    def from_dict(cls, data):
        """Crea una Actividad a partir de un diccionario"""
        return cls(
            nombre=data.get("nombre"),
            tipo=data.get("tipo"),
            duracionMin=data.get("duracionMin"),
            costoUSD=data.get("costoUSD"),
        )


class Trabajo:
    """Representa un trabajo disponible en un aeropuerto"""

    def __init__(self, nombre, tarifaHora, maxHoras):
        self.nombre = nombre
        self.tarifaHora = tarifaHora
        self.maxHoras = maxHoras

    def __repr__(self):
        return f"Trabajo({self.nombre}, ${self.tarifaHora}/hr, max {self.maxHoras}hrs)"

    @classmethod
    def from_dict(cls, data):
        """Crea un Trabajo a partir de un diccionario"""
        return cls(
            nombre=data.get("nombre"),
            tarifaHora=data.get("tarifaHora"),
            maxHoras=data.get("maxHoras"),
        )


class Aeropuerto(Vertice):
    """Representa un aeropuerto con información completa para el sistema de rutas"""

    def __init__(
        self,
        id,
        nombre,
        ciudad,
        pais,
        zonaHoraria,
        esHub,
        costoAlojamiento,
        costoAlimentacion,
        actividades=None,
        trabajos=None,
    ):
        super().__init__(id)
        self.nombre = nombre
        self.ciudad = ciudad
        self.pais = pais
        self.zonaHoraria = zonaHoraria
        self.esHub = esHub
        self.costoAlojamiento = costoAlojamiento
        self.costoAlimentacion = costoAlimentacion
        self.actividades = actividades if actividades is not None else []
        self.trabajos = trabajos if trabajos is not None else []

    @classmethod
    def from_dict(cls, data):
        """
        Crea un Aeropuerto a partir de un diccionario (parsea JSON)

        Args:
            data (dict): Diccionario con estructura del JSON

        Returns:
            Aeropuerto: Instancia con todos los atributos parseados
        """
        actividades = [Actividad.from_dict(act) for act in data.get("actividades", [])]
        trabajos = [Trabajo.from_dict(trab) for trab in data.get("trabajos", [])]

        return cls(
            id=data.get("id"),
            nombre=data.get("nombre"),
            ciudad=data.get("ciudad"),
            pais=data.get("pais"),
            zonaHoraria=data.get("zonaHoraria"),
            esHub=data.get("esHub"),
            costoAlojamiento=data.get("costoAlojamiento"),
            costoAlimentacion=data.get("costoAlimentacion"),
            actividades=actividades,
            trabajos=trabajos,
        )

    def __str__(self):
        hub_text = "Hub" if self.esHub else "No Hub"
        return f"""
Aeropuerto: {self.nombre} ({self.identifier})
  Ciudad: {self.ciudad}, {self.pais}
  Zona Horaria: {self.zonaHoraria}
  Estado: {hub_text}
  Costo Alojamiento: ${self.costoAlojamiento}
  Costo Alimentación: ${self.costoAlimentacion}
  Actividades ({len(self.actividades)}): {[str(a) for a in self.actividades]}
  Trabajos ({len(self.trabajos)}): {[str(t) for t in self.trabajos]}
"""

    def __repr__(self):
        return f"Aeropuerto({self.identifier}, {self.nombre})"
