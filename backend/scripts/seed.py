"""
Seed script — creates a complete demo workspace for testing.
Run: docker compose exec backend python scripts/seed.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import AsyncSessionLocal
from app.database.models import (
    Tenant, User, UserRole, WhatsAppAccount, Contact,
    Conversation, Message, ConversationStatus, MessageDirection, MessageStatus,
    BotFlow, FAQ, Form, FormField, FormFieldType,
    Lead, LeadStage, Campaign, CampaignStatus,
    Subscription, SubscriptionPlan, SubscriptionStatus,
)
from app.auth.service import hash_password


async def seed():
    async with AsyncSessionLocal() as db:
        print("🌱 Seeding demo data...")

        # ── Tenant ──────────────────────────────────────────────────────────────
        tenant = Tenant(
            id=uuid.uuid4(),
            name="Acme Furniture Store",
            slug="acme-furniture",
            primary_color="#25D366",
            email_from_name="Acme Support",
            email_from_address="support@acmefurniture.com",
            is_active=True,
        )
        db.add(tenant)
        await db.flush()
        print(f"  ✓ Tenant: {tenant.name} (slug: {tenant.slug})")

        # ── Subscription ─────────────────────────────────────────────────────
        subscription = Subscription(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            plan=SubscriptionPlan.GROWTH,
            status=SubscriptionStatus.ACTIVE,
            max_agents=10,
            max_conversations_per_month=10000,
            max_whatsapp_numbers=3,
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=30),
        )
        db.add(subscription)

        # ── Users ────────────────────────────────────────────────────────────
        owner = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Raj Kumar",
            email="raj@acmefurniture.com",
            hashed_password=hash_password("demo1234"),
            role=UserRole.OWNER,
            is_active=True,
            email_verified=True,
        )
        db.add(owner)

        agent1 = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Aisha Mehta",
            email="aisha@acmefurniture.com",
            hashed_password=hash_password("demo1234"),
            role=UserRole.AGENT,
            is_active=True,
            email_verified=True,
        )
        db.add(agent1)

        agent2 = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Suraj Verma",
            email="suraj@acmefurniture.com",
            hashed_password=hash_password("demo1234"),
            role=UserRole.AGENT,
            is_active=True,
            email_verified=True,
        )
        db.add(agent2)
        await db.flush()
        print(f"  ✓ Users: {owner.name} (owner), {agent1.name}, {agent2.name}")

        # ── WhatsApp Account ─────────────────────────────────────────────────
        wa_account = WhatsAppAccount(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            phone_number="+919876543210",
            phone_number_id="DEMO_PHONE_NUMBER_ID",
            waba_id="DEMO_WABA_ID",
            access_token="DEMO_ACCESS_TOKEN_REPLACE_WITH_REAL",
            display_name="Acme Furniture",
            is_active=True,
            webhook_verified=True,
        )
        db.add(wa_account)
        await db.flush()
        print(f"  ✓ WhatsApp: {wa_account.phone_number}")

        # ── Contacts ─────────────────────────────────────────────────────────
        contacts_data = [
            {"name": "Priya Kapoor", "phone": "+919811223344", "email": "priya@email.com", "city": "Mumbai", "tags": ["sofa", "high-intent"], "source": "whatsapp_form"},
            {"name": "Ravi Verma", "phone": "+917788991122", "email": "ravi@email.com", "city": "Delhi", "tags": ["chair", "emi"], "source": "bot_flow"},
            {"name": "Anita Shah", "phone": "+919122334455", "email": "anita@email.com", "city": "Ahmedabad", "tags": ["bedroom"], "source": "broadcast"},
            {"name": "Manish Kumar", "phone": "+918800112233", "email": "manish@email.com", "city": "Bangalore", "tags": ["sofa", "won"], "source": "whatsapp_form"},
            {"name": "Sunita Patil", "phone": "+919988776655", "email": "sunita@email.com", "city": "Pune", "tags": ["dining"], "source": "bot_flow"},
            {"name": "Arjun Joshi", "phone": "+918844002211", "email": "arjun@email.com", "city": "Chennai", "tags": ["office"], "source": "organic"},
            {"name": "Kavya Nair", "phone": "+917700334411", "email": "kavya@email.com", "city": "Hyderabad", "tags": ["bedroom", "wardrobe"], "source": "broadcast"},
            {"name": "Deepak Singh", "phone": "+919633221100", "email": "deepak@email.com", "city": "Kolkata", "tags": ["sofa"], "source": "whatsapp_form"},
        ]
        contacts = []
        for cd in contacts_data:
            c = Contact(id=uuid.uuid4(), tenant_id=tenant.id, **cd)
            db.add(c)
            contacts.append(c)
        await db.flush()
        print(f"  ✓ Contacts: {len(contacts)} created")

        # ── Conversations ─────────────────────────────────────────────────────
        conv_data = [
            (contacts[0], ConversationStatus.ASSIGNED, agent1.id, False, "Can I get a custom color?"),
            (contacts[1], ConversationStatus.BOT, None, True, "What's the price of Oslo sofa?"),
            (contacts[2], ConversationStatus.OPEN, None, False, "Is there parking at the showroom?"),
            (contacts[3], ConversationStatus.RESOLVED, agent1.id, False, "Thank you! Will visit tomorrow."),
            (contacts[4], ConversationStatus.BOT, None, True, "Do you deliver to Pune?"),
        ]
        conversations = []
        for contact, status, agent_id, bot_active, preview in conv_data:
            conv = Conversation(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                contact_id=contact.id,
                whatsapp_account_id=wa_account.id,
                assigned_agent_id=agent_id,
                status=status,
                bot_active=bot_active,
                last_message_at=datetime.utcnow() - timedelta(minutes=5),
                last_message_preview=preview,
                unread_count=1 if status != ConversationStatus.RESOLVED else 0,
            )
            db.add(conv)
            conversations.append(conv)
        await db.flush()
        print(f"  ✓ Conversations: {len(conversations)} created")

        # ── Messages for first conversation ──────────────────────────────────
        msg_data = [
            (MessageDirection.INBOUND, "Hi! I'd like to know more about your sofa collection 😊"),
            (MessageDirection.OUTBOUND, "Welcome to Acme Furniture! 🛋️ How can we help you today?\n\n1️⃣ View Products\n2️⃣ Check Pricing\n3️⃣ Book a Visit\n4️⃣ Talk to Agent"),
            (MessageDirection.INBOUND, "1"),
            (MessageDirection.OUTBOUND, "Great! We have sofas starting from ₹18,000.\n\n• Oslo 3-Seater – ₹24,999\n• Madrid L-Shape – ₹38,500\n• Tokyo Recliner – ₹52,000\n\nWould you like to see more?"),
            (MessageDirection.INBOUND, "Can I get a custom color?"),
            (MessageDirection.OUTBOUND, "Yes! We offer 18 fabric colors and 6 leather finishes. A consultant can guide you. Shall I connect you with our team?"),
            (MessageDirection.INBOUND, "Please yes!"),
            (MessageDirection.OUTBOUND, "Hi Priya! I'm Aisha from the sales team. Happy to help you with custom options. What colour were you thinking?"),
        ]
        for i, (direction, content) in enumerate(msg_data):
            msg = Message(
                id=uuid.uuid4(),
                conversation_id=conversations[0].id,
                tenant_id=tenant.id,
                direction=direction,
                message_type="text",
                content=content,
                status=MessageStatus.READ,
                is_internal_note=False,
                sent_by_agent_id=agent1.id if direction == MessageDirection.OUTBOUND and i >= 6 else None,
            )
            db.add(msg)
        print(f"  ✓ Messages: {len(msg_data)} for first conversation")

        # ── Bot Flow ─────────────────────────────────────────────────────────
        bot_flow = BotFlow(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Acme Furniture Bot",
            is_active=True,
            flow_data={
                "nodes": [
                    {
                        "id": "welcome_1",
                        "type": "welcome",
                        "data": {"text": "Welcome to Acme Furniture! 🛋️ India's finest furniture store. How can we help you today?"},
                        "position": {"x": 300, "y": 0},
                    },
                    {
                        "id": "menu_1",
                        "type": "menu",
                        "data": {
                            "body": "Please choose an option:",
                            "options": [
                                {"id": "opt_0", "label": "View Products", "target_node_id": "text_products"},
                                {"id": "opt_1", "label": "Check Pricing", "target_node_id": "text_pricing"},
                                {"id": "opt_2", "label": "Book a Showroom Visit", "target_node_id": "collect_visit"},
                                {"id": "opt_3", "label": "Talk to an Agent", "target_node_id": "handoff_1"},
                            ],
                        },
                        "position": {"x": 300, "y": 140},
                    },
                    {
                        "id": "text_products",
                        "type": "text",
                        "data": {"text": "Our top products:\n\n🛋️ Oslo 3-Seater Sofa – ₹24,999\n🛋️ Madrid L-Shape – ₹38,500\n🪑 Tokyo Recliner – ₹52,000\n🛏️ Nordic King Bed – ₹42,000\n\nWant to visit our showroom?"},
                        "position": {"x": 100, "y": 300},
                    },
                    {
                        "id": "text_pricing",
                        "type": "text",
                        "data": {"text": "💰 Our prices start at:\n\n• Sofas from ₹18,000\n• Beds from ₹22,000\n• Dining sets from ₹15,000\n• Wardrobes from ₹28,000\n\nEMI available from ₹999/month!"},
                        "position": {"x": 300, "y": 300},
                    },
                    {
                        "id": "collect_visit",
                        "type": "collect_info",
                        "data": {"prompt": "Great! Please share your name and preferred date for the visit and our team will confirm your slot."},
                        "position": {"x": 500, "y": 300},
                    },
                    {
                        "id": "handoff_1",
                        "type": "agent_handoff",
                        "data": {"message": "Connecting you with our team now. Please wait a moment... 🙏"},
                        "position": {"x": 700, "y": 300},
                    },
                    {
                        "id": "fallback_1",
                        "type": "fallback",
                        "data": {"text": "Sorry, I didn't quite understand that. 🤔\n\nReply *menu* to see all options or type your question directly."},
                        "position": {"x": 300, "y": 480},
                    },
                ],
                "edges": [
                    {"id": "e1", "source": "welcome_1", "target": "menu_1"},
                    {"id": "e2", "source": "menu_1", "target": "text_products", "label": "1"},
                    {"id": "e3", "source": "menu_1", "target": "text_pricing", "label": "2"},
                    {"id": "e4", "source": "menu_1", "target": "collect_visit", "label": "3"},
                    {"id": "e5", "source": "menu_1", "target": "handoff_1", "label": "4"},
                    {"id": "e6", "source": "menu_1", "target": "fallback_1", "label": "default"},
                ],
            },
        )
        db.add(bot_flow)
        print(f"  ✓ Bot flow: {bot_flow.name} (active)")

        # ── FAQs ─────────────────────────────────────────────────────────────
        faqs_data = [
            ("What are your store timings?", "We are open Monday to Saturday, 10:00 AM – 8:00 PM. Sunday 11:00 AM – 6:00 PM. We're closed on national holidays.", ["timing", "hours", "open", "close", "time", "when"], "General", 234),
            ("Do you offer EMI?", "Yes! We offer easy EMI options starting from ₹999/month with 0% interest on select products. Available via major credit cards and Bajaj Finserv.", ["emi", "loan", "installment", "finance", "credit", "monthly"], "Pricing", 188),
            ("What's the warranty on sofas?", "All our sofas come with a 2-year frame warranty and 1-year fabric warranty. Recliners have a 3-year motor warranty.", ["warranty", "guarantee", "repair", "defect", "broken"], "Product", 142),
            ("Can I return a product?", "Yes, we accept returns within 7 days of delivery if the product is unused and in original condition. Contact us at support@acmefurniture.com.", ["return", "refund", "exchange", "cancel", "back"], "Support", 97),
            ("Do you offer home delivery?", "Yes! We deliver across India. Delivery is free within 20km of our showrooms. Pan-India delivery charges apply based on location.", ["delivery", "ship", "transport", "home delivery", "courier"], "General", 156),
            ("Can I customize furniture?", "Absolutely! We offer custom sizes, fabric choices (18 colors), wood finishes, and hardware options. Custom orders take 3-4 weeks.", ["custom", "customize", "colour", "color", "size", "design"], "Product", 89),
        ]
        for q, a, kw, cat, hits in faqs_data:
            faq = FAQ(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                question=q,
                answer=a,
                keywords=kw,
                category=cat,
                hit_count=hits,
                is_active=True,
            )
            db.add(faq)
        print(f"  ✓ FAQs: {len(faqs_data)} created")

        # ── Lead Form ─────────────────────────────────────────────────────────
        form = Form(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Sofa Inquiry Form",
            description="Collect customer details for sofa enquiries",
            is_active=True,
            response_count=218,
        )
        db.add(form)
        await db.flush()

        fields_data = [
            ("Full Name", FormFieldType.TEXT, True, 0, [], "Your full name", "name"),
            ("Phone Number", FormFieldType.NUMBER, True, 1, [], "+91 XXXXX XXXXX", "phone"),
            ("Email Address", FormFieldType.EMAIL, False, 2, [], "your@email.com", "email"),
            ("Budget Range", FormFieldType.DROPDOWN, True, 3, ["Under ₹20,000", "₹20,000 – ₹40,000", "₹40,000 – ₹80,000", "Above ₹80,000"], None, None),
            ("Preferred Visit Date", FormFieldType.DATE, False, 4, [], None, None),
            ("City", FormFieldType.TEXT, True, 5, [], "e.g. Mumbai", "city"),
        ]
        for label, ftype, required, order, options, placeholder, maps_to in fields_data:
            field = FormField(
                id=uuid.uuid4(),
                form_id=form.id,
                label=label,
                field_type=ftype,
                is_required=required,
                order=order,
                options=options,
                placeholder=placeholder,
                maps_to=maps_to,
            )
            db.add(field)
        print(f"  ✓ Form: {form.name} with {len(fields_data)} fields")

        # ── Leads ─────────────────────────────────────────────────────────────
        leads_data = [
            (contacts[0], LeadStage.QUALIFIED, agent1.id, "whatsapp_form", "Interested in custom Oslo sofa. High intent.", 38500),
            (contacts[1], LeadStage.NEW, None, "bot_flow", None, None),
            (contacts[2], LeadStage.CONTACTED, agent2.id, "broadcast", "Called, will visit showroom this weekend.", 24999),
            (contacts[3], LeadStage.WON, agent1.id, "whatsapp_form", "Purchased Madrid L-Shape. Happy customer.", 38500),
            (contacts[4], LeadStage.NEW, None, "bot_flow", None, None),
            (contacts[5], LeadStage.LOST, agent2.id, "organic", "Budget constraint. May return next quarter.", None),
            (contacts[6], LeadStage.QUALIFIED, agent1.id, "broadcast", "Looking for bedroom set + wardrobe combo.", 70000),
            (contacts[7], LeadStage.CONTACTED, agent2.id, "whatsapp_form", "Wants sofa for new apartment.", 24999),
        ]
        for contact, stage, agent_id, source, notes, value in leads_data:
            lead = Lead(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                contact_id=contact.id,
                stage=stage,
                assigned_agent_id=agent_id,
                source=source,
                notes=notes,
                value=value,
            )
            db.add(lead)
        print(f"  ✓ Leads: {len(leads_data)} across all pipeline stages")

        # ── Campaigns ─────────────────────────────────────────────────────────
        campaigns_data = [
            ("Summer Sale 2025", "promo_summer_v2", CampaignStatus.COMPLETED, 1240, 1198, 876, 234, 0),
            ("New Arrivals – Furniture", "new_arrivals_june", CampaignStatus.COMPLETED, 890, 865, 512, 98, 0),
            ("Follow-up – June Leads", "followup_v1", CampaignStatus.SCHEDULED, 0, 0, 0, 0, 320),
            ("Diwali Collection Preview", "diwali_preview_v1", CampaignStatus.DRAFT, 0, 0, 0, 0, 0),
        ]
        for name, template, status, sent, delivered, read, failed, audience in campaigns_data:
            campaign = Campaign(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name=name,
                template_name=template,
                template_language="en",
                status=status,
                audience_count=audience or sent,
                sent_count=sent,
                delivered_count=delivered,
                read_count=read,
                failed_count=failed,
                scheduled_at=datetime.utcnow() + timedelta(days=2) if status == CampaignStatus.SCHEDULED else None,
                started_at=datetime.utcnow() - timedelta(days=7) if status == CampaignStatus.COMPLETED else None,
                completed_at=datetime.utcnow() - timedelta(days=6) if status == CampaignStatus.COMPLETED else None,
            )
            db.add(campaign)
        print(f"  ✓ Campaigns: {len(campaigns_data)} created")

        await db.commit()

        print("")
        print("✅ Seed complete!")
        print("")
        print("  Login credentials:")
        print(f"  ┌─ Company Slug : acme-furniture")
        print(f"  ├─ Owner Email  : raj@acmefurniture.com")
        print(f"  ├─ Agent Email  : aisha@acmefurniture.com")
        print(f"  └─ Password     : demo1234  (all users)")
        print("")
        print("  API docs: http://localhost:8000/api/docs (DEBUG mode only)")
        print("  App:      http://localhost:3000")
        print("")


if __name__ == "__main__":
    asyncio.run(seed())
