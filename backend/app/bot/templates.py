"""
Predefined bot flow templates for small-business onboarding.

Each template is a starting point a business can pick during signup and then
edit further in the flow builder — it's plain flow_data using the same node
shape the bot engine and canvas already understand (welcome / menu / text /
collect_info / agent_handoff). `{{business_name}}` is substituted with the
tenant's name when a template is applied.
"""

GENERIC_SMALL_BUSINESS = {
    "key": "generic_small_business",
    "name": "Generic Small Business",
    "description": "A general-purpose starting point for any small business: about, products/pricing, callback request, and human handoff.",
    "flow_data": {
        "nodes": [
            {"id": "welcome", "type": "welcome", "position": {"x": 0, "y": 0},
             "data": {"text": "👋 Hi there! Welcome to {{business_name}}. How can we help you today?"}},
            {"id": "main_menu", "type": "menu", "position": {"x": 0, "y": 150},
             "data": {
                 "header": "Please choose an option:",
                 "options": [
                     {"label": "About Us", "target_node_id": "about"},
                     {"label": "Products & Pricing", "target_node_id": "products"},
                     {"label": "Book a Call", "target_node_id": "book_call"},
                     {"label": "Talk to a Human", "target_node_id": "handoff"},
                 ],
             }},
            {"id": "about", "type": "text", "position": {"x": -300, "y": 300},
             "data": {"text": "We're {{business_name}}. [Edit this in the flow builder to describe your business.]\n\nReply *menu* to see other options."}},
            {"id": "products", "type": "text", "position": {"x": -100, "y": 300},
             "data": {"text": "Here's what we offer: [Edit this in the flow builder to list your products/services and pricing.]\n\nReply *menu* to see other options."}},
            {"id": "book_call", "type": "collect_info", "position": {"x": 100, "y": 300},
             "data": {
                 "prompt": "Sure! Please share your name and the best time to call you back.",
                 "confirmation": "Thanks! We've noted your request and will call you back soon. Reply *menu* for other options.",
             }},
            {"id": "handoff", "type": "agent_handoff", "position": {"x": 300, "y": 300},
             "data": {"message": "Connecting you with our team. Please wait a moment..."}},
        ],
        "edges": [
            {"id": "e1", "source": "welcome", "target": "main_menu"},
            {"id": "e2", "source": "main_menu", "target": "about", "label": "About Us"},
            {"id": "e3", "source": "main_menu", "target": "products", "label": "Products & Pricing"},
            {"id": "e4", "source": "main_menu", "target": "book_call", "label": "Book a Call"},
            {"id": "e5", "source": "main_menu", "target": "handoff", "label": "Talk to a Human"},
        ],
    },
}

SALON_CLINIC = {
    "key": "salon_clinic",
    "name": "Salon / Clinic (Appointments)",
    "description": "For appointment-based businesses like salons, spas, and clinics: booking, services & pricing, location & hours.",
    "flow_data": {
        "nodes": [
            {"id": "welcome", "type": "welcome", "position": {"x": 0, "y": 0},
             "data": {"text": "👋 Hello! Welcome to {{business_name}}. How can we assist you today?"}},
            {"id": "main_menu", "type": "menu", "position": {"x": 0, "y": 150},
             "data": {
                 "header": "Please choose an option:",
                 "options": [
                     {"label": "Book Appointment", "target_node_id": "book_appointment"},
                     {"label": "Services & Pricing", "target_node_id": "services"},
                     {"label": "Location & Hours", "target_node_id": "location"},
                     {"label": "Talk to a Human", "target_node_id": "handoff"},
                 ],
             }},
            {"id": "book_appointment", "type": "collect_info", "position": {"x": -300, "y": 300},
             "data": {
                 "prompt": "Great! Please share your name, the service you'd like, and your preferred date & time.",
                 "confirmation": "Thanks! We've received your appointment request and will confirm shortly. Reply *menu* for other options.",
             }},
            {"id": "services", "type": "text", "position": {"x": -100, "y": 300},
             "data": {"text": "Our services: [Edit this in the flow builder to list your services and pricing.]\n\nReply *menu* to see other options."}},
            {"id": "location", "type": "text", "position": {"x": 100, "y": 300},
             "data": {"text": "📍 [Edit this in the flow builder with your address and opening hours.]\n\nReply *menu* to see other options."}},
            {"id": "handoff", "type": "agent_handoff", "position": {"x": 300, "y": 300},
             "data": {"message": "Connecting you with our team. Please wait a moment..."}},
        ],
        "edges": [
            {"id": "e1", "source": "welcome", "target": "main_menu"},
            {"id": "e2", "source": "main_menu", "target": "book_appointment", "label": "Book Appointment"},
            {"id": "e3", "source": "main_menu", "target": "services", "label": "Services & Pricing"},
            {"id": "e4", "source": "main_menu", "target": "location", "label": "Location & Hours"},
            {"id": "e5", "source": "main_menu", "target": "handoff", "label": "Talk to a Human"},
        ],
    },
}

RESTAURANT_RETAIL = {
    "key": "restaurant_retail",
    "name": "Restaurant / Retail (Orders)",
    "description": "For order-based businesses like restaurants and retail shops: catalog, order requests, delivery info.",
    "flow_data": {
        "nodes": [
            {"id": "welcome", "type": "welcome", "position": {"x": 0, "y": 0},
             "data": {"text": "👋 Hi! Welcome to {{business_name}}. How can we help you today?"}},
            {"id": "main_menu", "type": "menu", "position": {"x": 0, "y": 150},
             "data": {
                 "header": "Please choose an option:",
                 "options": [
                     {"label": "View Menu/Catalog", "target_node_id": "catalog"},
                     {"label": "Order Now", "target_node_id": "order"},
                     {"label": "Delivery Area & Hours", "target_node_id": "delivery"},
                     {"label": "Talk to a Human", "target_node_id": "handoff"},
                 ],
             }},
            {"id": "catalog", "type": "text", "position": {"x": -300, "y": 300},
             "data": {"text": "Here's our menu/catalog: [Edit this in the flow builder to add a link or item list.]\n\nReply *menu* to see other options."}},
            {"id": "order", "type": "collect_info", "position": {"x": -100, "y": 300},
             "data": {
                 "prompt": "Awesome! Please tell us what you'd like to order and your delivery address.",
                 "confirmation": "Got it! Your order request has been received — we'll confirm shortly. Reply *menu* for other options.",
             }},
            {"id": "delivery", "type": "text", "position": {"x": 100, "y": 300},
             "data": {"text": "🚚 [Edit this in the flow builder with your delivery area and hours.]\n\nReply *menu* to see other options."}},
            {"id": "handoff", "type": "agent_handoff", "position": {"x": 300, "y": 300},
             "data": {"message": "Connecting you with our team. Please wait a moment..."}},
        ],
        "edges": [
            {"id": "e1", "source": "welcome", "target": "main_menu"},
            {"id": "e2", "source": "main_menu", "target": "catalog", "label": "View Menu/Catalog"},
            {"id": "e3", "source": "main_menu", "target": "order", "label": "Order Now"},
            {"id": "e4", "source": "main_menu", "target": "delivery", "label": "Delivery Area & Hours"},
            {"id": "e5", "source": "main_menu", "target": "handoff", "label": "Talk to a Human"},
        ],
    },
}

BOT_FLOW_TEMPLATES = {
    t["key"]: t for t in [GENERIC_SMALL_BUSINESS, SALON_CLINIC, RESTAURANT_RETAIL]
}


def render_template(template_key: str, business_name: str) -> dict:
    """Return a deep-copied, name-substituted flow_data dict for the given template."""
    import copy
    import json

    template = BOT_FLOW_TEMPLATES.get(template_key)
    if not template:
        raise KeyError(template_key)

    flow_data = copy.deepcopy(template["flow_data"])
    raw = json.dumps(flow_data).replace("{{business_name}}", business_name or "us")
    return json.loads(raw)
