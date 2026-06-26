"""
Bot Engine — Menu-based bot with FAQ matching and keyword routing.
No AI in MVP. Pure rule-based processing.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    BotFlow, FAQ, Contact, Conversation, WhatsAppAccount,
    Message, MessageDirection, MessageStatus
)
from app.whatsapp.router import send_whatsapp_message


# ─── Message Processor ────────────────────────────────────────────────────────

async def process_message(
    content: str,
    conversation: Conversation,
    contact: Contact,
    wa_account: WhatsAppAccount,
    db: AsyncSession,
):
    """
    Main bot processing pipeline:
    1. Check active bot flow for the tenant
    2. Match FAQ keywords
    3. Route menu selections
    4. Send fallback if nothing matched
    """
    if not content:
        return

    content_lower = content.strip().lower()

    # Get active bot flow for tenant
    result = await db.execute(
        select(BotFlow).where(
            BotFlow.tenant_id == wa_account.tenant_id,
            BotFlow.is_active == True,
        )
    )
    flow = result.scalar_one_or_none()

    if not flow:
        await send_default_welcome(conversation, contact, wa_account)
        return

    flow_data = flow.flow_data or {}
    nodes = flow_data.get("nodes", [])
    current_node_id = conversation.metadata.get("current_node_id") if conversation.metadata else None

    # Check for FAQ match first (higher priority than menu)
    faq_answer = await match_faq(content_lower, wa_account.tenant_id, db)
    if faq_answer:
        await send_text(wa_account, contact.phone, faq_answer)
        await save_outbound_message(conversation, wa_account, faq_answer, db)
        return

    # Route based on current node or find entry point
    matched = await route_flow(content_lower, nodes, current_node_id, conversation, contact, wa_account, db)
    if not matched:
        await send_fallback(wa_account, contact.phone)
        await save_outbound_message(
            conversation, wa_account,
            "Sorry, I didn't understand that. Please reply with a menu number or keyword.",
            db,
        )


# ─── FAQ Matching ─────────────────────────────────────────────────────────────

async def match_faq(text: str, tenant_id, db: AsyncSession) -> str | None:
    result = await db.execute(
        select(FAQ).where(FAQ.tenant_id == tenant_id, FAQ.is_active == True)
    )
    faqs = result.scalars().all()

    for faq in faqs:
        keywords = faq.keywords or []
        if any(kw.lower() in text for kw in keywords):
            # Increment hit count
            faq.hit_count = (faq.hit_count or 0) + 1
            return faq.answer

    return None


# ─── Flow Router ──────────────────────────────────────────────────────────────

async def route_flow(
    content: str,
    nodes: list,
    current_node_id: str | None,
    conversation: Conversation,
    contact: Contact,
    wa_account: WhatsAppAccount,
    db: AsyncSession,
) -> bool:
    """Route the conversation through bot flow nodes."""

    # Entry: welcome message + main menu
    if current_node_id is None or content in ["hi", "hello", "hii", "hey", "start", "menu"]:
        welcome_node = find_node_by_type(nodes, "welcome")
        menu_node = find_node_by_type(nodes, "menu")

        if welcome_node:
            await send_text(wa_account, contact.phone, welcome_node.get("data", {}).get("text", "Welcome!"))
            await save_outbound_message(conversation, wa_account, welcome_node["data"]["text"], db)

        if menu_node:
            await send_menu(wa_account, contact.phone, menu_node)
            await save_outbound_message(
                conversation, wa_account,
                format_menu_text(menu_node),
                db,
            )
            update_conversation_node(conversation, menu_node["id"])
        return True

    # In a menu context — check if input matches an option
    if current_node_id:
        current_node = find_node_by_id(nodes, current_node_id)
        if current_node and current_node.get("type") == "menu":
            options = current_node.get("data", {}).get("options", [])
            # Match by number or text
            for i, opt in enumerate(options, 1):
                if content == str(i) or content == opt.get("label", "").lower():
                    target_id = opt.get("target_node_id")
                    if target_id:
                        target_node = find_node_by_id(nodes, target_id)
                        if target_node:
                            await execute_node(target_node, nodes, conversation, contact, wa_account, db)
                            return True

    return False


async def execute_node(node: dict, nodes: list, conversation: Conversation, contact: Contact, wa_account: WhatsAppAccount, db: AsyncSession):
    node_type = node.get("type")
    data = node.get("data", {})

    if node_type == "text":
        text = data.get("text", "")
        await send_text(wa_account, contact.phone, text)
        await save_outbound_message(conversation, wa_account, text, db)

    elif node_type == "menu":
        await send_menu(wa_account, contact.phone, node)
        await save_outbound_message(conversation, wa_account, format_menu_text(node), db)
        update_conversation_node(conversation, node["id"])

    elif node_type == "collect_info":
        text = data.get("prompt", "Please provide your details:")
        await send_text(wa_account, contact.phone, text)
        await save_outbound_message(conversation, wa_account, text, db)
        update_conversation_node(conversation, node["id"])

    elif node_type == "agent_handoff":
        text = data.get("message", "Connecting you with our team. Please wait a moment...")
        await send_text(wa_account, contact.phone, text)
        await save_outbound_message(conversation, wa_account, text, db)
        # Signal for agent takeover
        conversation.bot_active = False
        from app.database.models import ConversationStatus
        conversation.status = ConversationStatus.OPEN


# ─── Send Helpers ─────────────────────────────────────────────────────────────

async def send_text(wa_account: WhatsAppAccount, to: str, text: str):
    try:
        await send_whatsapp_message(
            wa_account.phone_number_id,
            wa_account.access_token,
            to,
            "text",
            text,
        )
    except Exception as e:
        print(f"[Bot] Failed to send message: {e}")


async def send_menu(wa_account: WhatsAppAccount, to: str, menu_node: dict):
    data = menu_node.get("data", {})
    options = data.get("options", [])
    header = data.get("header", "")
    body = data.get("body", format_menu_text(menu_node))

    if len(options) <= 3:
        # Use quick reply buttons
        buttons = [
            {"type": "reply", "reply": {"id": f"opt_{i}", "title": opt["label"][:20]}}
            for i, opt in enumerate(options[:3])
        ]
        interactive = {
            "type": "button",
            "body": {"text": body},
            "action": {"buttons": buttons},
        }
        if header:
            interactive["header"] = {"type": "text", "text": header}

        await send_whatsapp_message(wa_account.phone_number_id, wa_account.access_token, to, "interactive", interactive)
    else:
        # Use list for 4+ options
        rows = [
            {"id": f"opt_{i}", "title": opt["label"][:24]}
            for i, opt in enumerate(options)
        ]
        interactive = {
            "type": "list",
            "body": {"text": body},
            "action": {"button": "View Options", "sections": [{"title": "Menu", "rows": rows}]},
        }
        await send_whatsapp_message(wa_account.phone_number_id, wa_account.access_token, to, "interactive", interactive)


async def send_default_welcome(conversation: Conversation, contact: Contact, wa_account: WhatsAppAccount):
    text = (
        f"👋 Hello{' ' + contact.name if contact.name else ''}! Welcome.\n\n"
        "Reply with *menu* to see options or type your question."
    )
    await send_text(wa_account, contact.phone, text)


async def send_fallback(wa_account: WhatsAppAccount, to: str):
    await send_text(
        wa_account, to,
        "Sorry, I didn't quite understand that. 🤔\n\nReply *menu* to see all options or type your question."
    )


# ─── Utilities ────────────────────────────────────────────────────────────────

def find_node_by_type(nodes: list, node_type: str) -> dict | None:
    return next((n for n in nodes if n.get("type") == node_type), None)


def find_node_by_id(nodes: list, node_id: str) -> dict | None:
    return next((n for n in nodes if n.get("id") == node_id), None)


def format_menu_text(menu_node: dict) -> str:
    data = menu_node.get("data", {})
    header = data.get("header", "How can I help you?")
    options = data.get("options", [])
    lines = [header, ""]
    for i, opt in enumerate(options, 1):
        lines.append(f"{i}️⃣ {opt['label']}")
    return "\n".join(lines)


def update_conversation_node(conversation: Conversation, node_id: str):
    meta = conversation.metadata or {}
    meta["current_node_id"] = node_id
    conversation.metadata = meta


async def save_outbound_message(
    conversation: Conversation,
    wa_account: WhatsAppAccount,
    content: str,
    db: AsyncSession,
):
    msg = Message(
        conversation_id=conversation.id,
        tenant_id=wa_account.tenant_id,
        direction=MessageDirection.OUTBOUND,
        message_type="text",
        content=content,
        status=MessageStatus.SENT,
    )
    db.add(msg)
    conversation.last_message_preview = content[:100]
