from pathlib import Path
import json

jsonRouteIntern = Path(__file__).resolve().parent.parent / "data" / "graph.json"


def readJson(route):
    with open(route, "r", encoding="utf-8") as archive:
        return json.load(archive)


def writeJson(jsonData, route):
    print(f"jsonData: {jsonData}")
    with open(route, "w") as archive:
        archive.write(jsonData)
        print(f"Content written to {route}")


def addContentToJson(newContent, route):
    if newContent == "" or newContent is None:
        return
    print(f"newContent: {newContent}")
    with open(route, "a") as archive:
        newContent = f",{newContent}"
        archive.write(str(newContent))
        print(f"Content added to {route}")
