"""Dependency graph utilities (etl §70-71, PRD v6.1 T6).

Answers: "dataset X changed — which published outputs are affected?"
Used pre-publication to plan dependency-aware reprocessing instead of
blindly rerunning everything.

Usage:
    python tools/dependencies.py ds_osm_facilities_jatinegara_raw
    python tools/dependencies.py --all
    python tools/dependencies.py --validate
"""
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
GRAPH = ROOT / "config" / "dependencies.json"


def load_graph() -> dict:
    return json.loads(GRAPH.read_text(encoding="utf-8"))


def affected_outputs(changed: str, graph: dict) -> list[str]:
    """Transitive closure of outputs affected by a changed dataset."""
    deps = graph["dependencies"]
    seen: set[str] = set()
    frontier = [changed]
    while frontier:
        node = frontier.pop()
        for out in deps.get(node, []):
            if out not in seen:
                seen.add(out)
                frontier.append(out)
    return sorted(seen)


def known_datasets(graph: dict) -> set[str]:
    deps = graph["dependencies"]
    nodes = set(deps)
    for outs in deps.values():
        nodes.update(outs)
    return nodes


def validate(graph: dict) -> list[str]:
    """Sanity checks: no self-loops, no dangling references outside known sets,
    methodology deps point at real ids."""
    problems = []
    deps = graph["dependencies"]
    nodes = known_datasets(graph)
    for inp, outs in deps.items():
        for out in outs:
            if inp == out:
                problems.append(f"self-loop: {inp}")
            if out not in nodes:
                problems.append(f"dangling output: {inp} -> {out}")
    known_meth = {"meth_fri_v1", "meth_priority_v1"}  # canonical methodologies
    for meth, outs in graph.get("methodology_dependencies", {}).items():
        if meth not in known_meth:
            problems.append(f"unknown methodology: {meth}")
        for out in outs:
            if out not in nodes:
                problems.append(f"dangling methodology output: {meth} -> {out}")
    return problems


def main() -> int:
    ap = __import__("argparse").ArgumentParser()
    ap.add_argument("dataset", nargs="?", help="dataset_id that changed")
    ap.add_argument("--all", action="store_true", help="show every edge")
    ap.add_argument("--validate", action="store_true", help="validate graph integrity")
    args = ap.parse_args()

    graph = load_graph()
    if args.validate:
        problems = validate(graph)
        if problems:
            print("GRAPH PROBLEMS:")
            for p in problems:
                print("  -", p)
            return 1
        print(f"graph OK: {len(graph['dependencies'])} inputs declared")
        return 0
    if args.all:
        for inp, outs in sorted(graph["dependencies"].items()):
            print(f"{inp}\n  -> {', '.join(outs)}")
        return 0
    if not args.dataset:
        ap.print_help()
        return 1
    affected = affected_outputs(args.dataset, graph)
    if not affected:
        print(f"{args.dataset}: no registered dependents")
        return 0
    print(f"{args.dataset} changed -> {len(affected)} affected output(s), reprocess in order:")
    for out in affected:
        print("  -", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
