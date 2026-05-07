class Activity:
    """It represents an activity available at an airport."""

    def __init__(self, name, activityType, durationMin, usdCost):
        self.name = name
        self.activityType = activityType
        self.durationMin = durationMin
        self.usdCost = usdCost

    def __repr__(self):
        return f"Actividad({self.name}, {self.activityType}, {self.durationMin}min, ${self.usdCost})"

    @classmethod
    def from_dict(cls, data):
        """Create an Activity from a dictionary"""
        return cls(
            name=data.get("nombre"),
            activityType=data.get("tipo"),
            durationMin=data.get("duracionMin"),
            usdCost=data.get("costoUSD"),
        )

    def to_dict(self):
        return {
            "nombre": self.name,
            "tipo": self.activityType,
            "duracionMin": self.durationMin,
            "costoUSD": self.usdCost,
        }