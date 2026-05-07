class Job:
    """It represents a job available at an airport."""

    def __init__(self, name, hourlyRate, maxHours):
        self.name = name
        self.hourlyRate = hourlyRate
        self.maxHours = maxHours

    def __repr__(self):
        return f"Trabajo({self.name}, ${self.hourlyRate}/hr, max {self.maxHours}hrs)"

    @classmethod
    def from_dict(cls, data):
        """Create a Job from a Dictionary"""
        return cls(
            name=data.get("nombre"),
            hourlyRate=data.get("tarifaHora"),
            maxHours=data.get("maxHoras"),
        )

    def to_dict(self):
        return {
            "nombre": self.name,
            "tarifaHora": self.hourlyRate,
            "maxHoras": self.maxHours,
        }
