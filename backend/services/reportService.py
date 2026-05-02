from .dynamicTravelService import DynamicTravelService
from .routePerformanceService import RoutePerformanceService

# These services could be the ones used to generate the final report


class FinalReport(DynamicTravelService, RoutePerformanceService):
    """
    This class receives data from other services to generate a final report
    """

    def __init__(
        self,
        destinationsVisited={},
        flightsCovered={},
        activitiesPerformed={},
        workCompleted={},
        totals={},
    ):
        self.destinationsVisited = destinationsVisited
        self.flightsCovered = flightsCovered
        self.activitiesPerformed = activitiesPerformed
        self.workCompleted = workCompleted
        self.totals = totals

    @classmethod
    def from_dict(cls, data):
        return cls(
            destinationsVisited=data.get("destinosVisitados"),
            flightsCovered=data.get("vuelosRecorridos"),
            activitiesPerformed=data.get("actividadesRealizadas"),
            workCompleted=data.get("trabajosRealizados"),
            totals=data.get("totales"),
        )

    def to_dict(self):
        return {
            "destinosVisitados": self.destinationsVisited,
            "vuelosRecorridos": self.flightsCovered,
            "actividadesRealizadas": self.activitiesPerformed,
            "trabajosRealizados": self.workCompleted,
            "totales": self.totals,
        }

    def __repr__(self):
        return f"FinalReport({self.destinationsVisited}, {self.flightsCovered}, {self.activitiesPerformed}, {self.workCompleted}, {self.totals})"
