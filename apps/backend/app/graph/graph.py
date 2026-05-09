from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.graph.nodes import assemble_node, critique_node, generate_shot_node, plan_node, scrape_node
from app.graph.state import AgentState


def _build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("scrape_node", scrape_node)
    workflow.add_node("plan_node", plan_node)
    workflow.add_node("generate_shot_node", generate_shot_node)
    workflow.add_node("critique_node", critique_node)
    workflow.add_node("assemble_node", assemble_node)

    workflow.add_edge(START, "scrape_node")
    workflow.add_edge("scrape_node", "plan_node")
    workflow.add_edge("plan_node", "generate_shot_node")
    workflow.add_edge("generate_shot_node", "critique_node")
    workflow.add_edge("critique_node", "assemble_node")
    workflow.add_edge("assemble_node", END)

    checkpointer = MemorySaver()
    return workflow.compile(
        checkpointer=checkpointer,
        interrupt_before=["plan_node", "generate_shot_node"],
    )


graph = _build_graph()


def get_graph():
    return graph