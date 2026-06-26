import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, JSON,
    String, Text, Float, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.sql import func


def gen_uuid():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# ─── Enums ─────────────────────────────────────────────────────────────────────

class UserRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    AGENT = "agent"


class SubscriptionPlan(str, Enum):
    STARTER = "starter"
    GROWTH = "growth"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"


class ConversationStatus(str, Enum):
    BOT = "bot"
    OPEN = "open"
    ASSIGNED = "assigned"
    RESOLVED = "resolved"


class LeadStage(str, Enum):
    NEW = "new"
    QUALIFIED = "qualified"
    CONTACTED = "contacted"
    WON = "won"
    LOST = "lost"


class MessageDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class MessageStatus(str, Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    PAUSED = "paused"


class FormFieldType(str, Enum):
    TEXT = "text"
    EMAIL = "email"
    NUMBER = "number"
    DROPDOWN = "dropdown"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    DATE = "date"
    TEXTAREA = "textarea"


# ─── Core Tables ──────────────────────────────────────────────────────────────

class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    logo_url = Column(String(500))
    primary_color = Column(String(7), default="#25D366")
    custom_domain = Column(String(255), unique=True)
    email_from_name = Column(String(255))
    email_from_address = Column(String(255))
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default={})

    # Relationships
    users = relationship("User", back_populates="tenant")
    whatsapp_accounts = relationship("WhatsAppAccount", back_populates="tenant")
    contacts = relationship("Contact", back_populates="tenant")
    conversations = relationship("Conversation", back_populates="tenant")
    faqs = relationship("FAQ", back_populates="tenant")
    forms = relationship("Form", back_populates="tenant")
    campaigns = relationship("Campaign", back_populates="tenant")
    subscription = relationship("Subscription", back_populates="tenant", uselist=False)
    bot_flows = relationship("BotFlow", back_populates="tenant")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.AGENT, nullable=False)
    avatar_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_seen_at = Column(DateTime(timezone=True))
    email_verified = Column(Boolean, default=False)
    reset_token = Column(String(255))
    reset_token_expires = Column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_tenant_user_email"),)

    tenant = relationship("Tenant", back_populates="users")
    assigned_conversations = relationship("Conversation", back_populates="assigned_agent",
                                          foreign_keys="Conversation.assigned_agent_id")


class WhatsAppAccount(Base, TimestampMixin):
    __tablename__ = "whatsapp_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    phone_number = Column(String(20), nullable=False)
    phone_number_id = Column(String(100), nullable=False)  # Meta Phone Number ID
    waba_id = Column(String(100), nullable=False)           # WhatsApp Business Account ID
    access_token = Column(Text, nullable=False)
    display_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    webhook_verified = Column(Boolean, default=False)

    tenant = relationship("Tenant", back_populates="whatsapp_accounts")


# ─── Contacts & Conversations ─────────────────────────────────────────────────

class Contact(Base, TimestampMixin):
    __tablename__ = "contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    phone = Column(String(20), nullable=False)
    name = Column(String(255))
    email = Column(String(255))
    city = Column(String(100))
    tags = Column(JSON, default=[])
    custom_attributes = Column(JSON, default={})
    opted_out = Column(Boolean, default=False)
    source = Column(String(100))  # whatsapp_form, broadcast, organic

    __table_args__ = (UniqueConstraint("tenant_id", "phone", name="uq_tenant_contact_phone"),)

    tenant = relationship("Tenant", back_populates="contacts")
    conversations = relationship("Conversation", back_populates="contact")
    leads = relationship("Lead", back_populates="contact")


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    whatsapp_account_id = Column(UUID(as_uuid=True), ForeignKey("whatsapp_accounts.id"))
    assigned_agent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    status = Column(SAEnum(ConversationStatus), default=ConversationStatus.BOT, nullable=False)
    last_message_at = Column(DateTime(timezone=True))
    last_message_preview = Column(String(255))
    unread_count = Column(Integer, default=0)
    bot_active = Column(Boolean, default=True)
    metadata = Column(JSON, default={})

    tenant = relationship("Tenant", back_populates="conversations")
    contact = relationship("Contact", back_populates="conversations")
    assigned_agent = relationship("User", back_populates="assigned_conversations",
                                  foreign_keys=[assigned_agent_id])
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    direction = Column(SAEnum(MessageDirection), nullable=False)
    message_type = Column(String(50), default="text")  # text, image, document, template, interactive
    content = Column(Text)
    media_url = Column(String(500))
    template_name = Column(String(255))
    status = Column(SAEnum(MessageStatus), default=MessageStatus.SENT)
    wa_message_id = Column(String(255))  # WhatsApp message ID for status tracking
    is_internal_note = Column(Boolean, default=False)
    sent_by_agent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    metadata = Column(JSON, default={})

    conversation = relationship("Conversation", back_populates="messages")


# ─── Bot & FAQ ────────────────────────────────────────────────────────────────

class BotFlow(Base, TimestampMixin):
    __tablename__ = "bot_flows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=False)
    flow_data = Column(JSON, default={})  # nodes and edges

    tenant = relationship("Tenant", back_populates="bot_flows")


class FAQ(Base, TimestampMixin):
    __tablename__ = "faqs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    keywords = Column(JSON, default=[])
    category = Column(String(100))
    hit_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    tenant = relationship("Tenant", back_populates="faqs")


# ─── Lead Forms ───────────────────────────────────────────────────────────────

class Form(Base, TimestampMixin):
    __tablename__ = "forms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    response_count = Column(Integer, default=0)

    tenant = relationship("Tenant", back_populates="forms")
    fields = relationship("FormField", back_populates="form", order_by="FormField.order")
    responses = relationship("FormResponse", back_populates="form")


class FormField(Base, TimestampMixin):
    __tablename__ = "form_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_id = Column(UUID(as_uuid=True), ForeignKey("forms.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(255), nullable=False)
    field_type = Column(SAEnum(FormFieldType), nullable=False)
    is_required = Column(Boolean, default=True)
    order = Column(Integer, default=0)
    options = Column(JSON, default=[])  # for dropdown/radio/checkbox
    placeholder = Column(String(255))
    maps_to = Column(String(100))  # contact field mapping: name, email, phone, city

    form = relationship("Form", back_populates="fields")


class FormResponse(Base, TimestampMixin):
    __tablename__ = "form_responses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_id = Column(UUID(as_uuid=True), ForeignKey("forms.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    answers = Column(JSON, nullable=False)

    form = relationship("Form", back_populates="responses")


# ─── Leads ───────────────────────────────────────────────────────────────────

class Lead(Base, TimestampMixin):
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False)
    stage = Column(SAEnum(LeadStage), default=LeadStage.NEW, nullable=False)
    assigned_agent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    source = Column(String(100))
    notes = Column(Text)
    value = Column(Float)  # estimated deal value
    custom_attributes = Column(JSON, default={})

    contact = relationship("Contact", back_populates="leads")


# ─── Campaigns ───────────────────────────────────────────────────────────────

class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    template_name = Column(String(255), nullable=False)
    template_language = Column(String(10), default="en")
    template_variables = Column(JSON, default=[])
    audience_filter = Column(JSON, default={})  # tags, stages, etc.
    audience_count = Column(Integer, default=0)
    scheduled_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    status = Column(SAEnum(CampaignStatus), default=CampaignStatus.DRAFT, nullable=False)

    # Delivery stats
    sent_count = Column(Integer, default=0)
    delivered_count = Column(Integer, default=0)
    read_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    clicked_count = Column(Integer, default=0)

    tenant = relationship("Tenant", back_populates="campaigns")


# ─── Subscriptions ───────────────────────────────────────────────────────────

class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    plan = Column(SAEnum(SubscriptionPlan), default=SubscriptionPlan.STARTER, nullable=False)
    status = Column(SAEnum(SubscriptionStatus), default=SubscriptionStatus.TRIALING, nullable=False)
    razorpay_subscription_id = Column(String(255))
    razorpay_customer_id = Column(String(255))
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    cancelled_at = Column(DateTime(timezone=True))

    # Limits per plan
    max_agents = Column(Integer, default=2)
    max_conversations_per_month = Column(Integer, default=1000)
    max_whatsapp_numbers = Column(Integer, default=1)

    tenant = relationship("Tenant", back_populates="subscription")
