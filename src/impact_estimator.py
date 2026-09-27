def get_savings_rate(distance_mi):
    if distance_mi <= 0:
        return 0.15
    elif distance_mi < 1.0:       # ~1.6 km
        return 0.10
    elif distance_mi < 5.0:       # ~8 km
        return 0.05
    elif distance_mi < 25.0:      # ~40 km
        return 0.03
    else:
        return 0.0


def get_coordination_type(distance_mi):
    if distance_mi <= 0:
        return (
            "crossing coordination, outage timing, right-of-way, "
            "access roads, permitting, laydown yards, deliveries, "
            "crews, and equipment"
        )
    elif distance_mi < 1.0:
        return (
            "right-of-way, access roads, permitting, laydown yards, "
            "deliveries, crews, and equipment"
        )
    elif distance_mi < 5.0:
        return "laydown yards, deliveries, crews, and equipment"
    elif distance_mi < 25.0:
        return "crews and equipment"
    else:
        return "no significant proximity-based coordination"


def estimate_cost_impact(cost_a, cost_b, distance_mi):
    savings_rate = get_savings_rate(distance_mi)

    combined_cost = cost_a + cost_b
    smaller_project_cost = min(cost_a, cost_b)
    estimated_savings = smaller_project_cost * savings_rate

    return {
        "combined_cost": combined_cost,
        "distance_mi": distance_mi,
        "coordination_type": get_coordination_type(distance_mi),
        "savings_rate": savings_rate,
        "estimated_savings": estimated_savings
    }


def describe_endpoint_proximity(project_a_name, project_b_name, distance_mi):
    projects = f"{project_a_name} and {project_b_name}"
    if distance_mi <= 0:
        return f"The nearest recorded endpoints for {projects} indicate a shared station."
    return (
        f"The nearest recorded endpoints for {projects} are "
        f"{distance_mi:.1f} miles apart."
    )


def generate_impact_explanation(
    project_a_name,
    project_b_name,
    cost_a,
    cost_b,
    distance_mi
):
    impact = estimate_cost_impact(
        cost_a,
        cost_b,
        distance_mi
    )

    return (
        f"{describe_endpoint_proximity(project_a_name, project_b_name, distance_mi)} "
        f"Their combined project cost is ${impact['combined_cost']:,.0f}. "
        f"Potential coordination includes "
        f"{impact['coordination_type']}. "
        f"Using a {impact['savings_rate']:.0%} prototype savings "
        f"assumption on the smaller project, the model estimates "
        f"savings of approximately "
        f"${impact['estimated_savings']:,.0f}."
    )
