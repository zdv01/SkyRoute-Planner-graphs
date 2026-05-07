from .vertex import Vertex
from .Activity import Activity
from .Job import Job


class Airport(Vertex):
    """It represents an airport with complete information for the routing system"""

    def __init__(
        self,
        id,
        name,
        city,
        country,
        timeZone,
        isHub,
        accommodationCost,
        alimentationCost,
        activities=None,
        jobs=None,
    ):
        super().__init__(id)
        self.name = name
        self.city = city
        self.country = country
        self.timeZone = timeZone
        self.isHub = isHub = isHub
        self.accommodationCost = accommodationCost
        self.alimentationCost = alimentationCost
        self.activities = activities if activities is not None else []
        self.jobs = jobs if jobs is not None else []

    @classmethod
    def from_dict(cls, data):
        """
        Create an Airport from a dictionary (parse JSON)

        Args:
            data (dict): Dictionary with JSON structure

        Returns:
            Airport: Instance with all attributes parsed
        """
        activities = [Activity.from_dict(act) for act in data.get("actividades", [])]
        jobs = [Job.from_dict(trab) for trab in data.get("trabajos", [])]

        return cls(
            id=data.get("id"),
            name=data.get("nombre"),
            city=data.get("ciudad"),
            country=data.get("pais"),
            timeZone=data.get("zonaHoraria"),
            isHub=data.get("esHub"),
            accommodationCost=data.get("costoAlojamiento"),
            alimentationCost=data.get("costoAlimentacion"),
            activities=activities,
            jobs=jobs,
        )

    def to_dict(self):
        return {
            "AEROPUERTO": self.name,
            "id": self.identifier,
            "ciudad": self.city,
            "pais": self.country,
            "zonaHoraria": self.timeZone,
            "esHub": self.isHub,
            "costoAlojamiento": self.accommodationCost,
            "costoAlimentacion": self.alimentationCost,
            "actividades": [act.to_dict() for act in self.activities],
            "trabajos": [job.to_dict() for job in self.jobs],
        }

    def __str__(self):
        hub_text = "Hub" if self.isHub else "No Hub"
        return f"""
Aeropuerto: {self.name} ({self.identifier})
  Ciudad: {self.city}, {self.country}
  Zona Horaria: {self.timeZone}
  Estado: {hub_text}
  Costo Alojamiento: ${self.accommodationCost}
  Costo Alimentación: ${self.alimentationCost}
  Actividades ({len(self.activities)}): {[str(a) for a in self.activities]}
  Trabajos ({len(self.jobs)}): {[str(t) for t in self.jobs]}
"""

    def __repr__(self):
        return f"Aeropuerto({self.identifier}, {self.name})"