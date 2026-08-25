"""
Production test suite for WapiSend backend.
Run: pytest tests/ -v
"""
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.database.session import get_db
from app.database.models import Base

# ── Test database setup ─────────────────────────────────────────────────────

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/wapisend_test"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
async def registered_tenant(client):
    """Register a fresh tenant and return auth tokens."""
    slug_suffix = str(uuid.uuid4())[:8]
    response = await client.post("/api/auth/signup", json={
        "company_name": f"Test Company {slug_suffix}",
        "owner_name": "Test Owner",
        "owner_email": f"owner_{slug_suffix}@test.com",
        "password": "testpass123",
    })
    assert response.status_code == 201
    return response.json()


@pytest.fixture
async def auth_headers(registered_tenant):
    return {"Authorization": f"Bearer {registered_tenant['access_token']}"}


# ── Auth tests ──────────────────────────────────────────────────────────────

class TestAuth:
    async def test_signup_success(self, client):
        slug = str(uuid.uuid4())[:8]
        res = await client.post("/api/auth/signup", json={
            "company_name": f"Company {slug}",
            "owner_name": "Owner Name",
            "owner_email": f"test_{slug}@example.com",
            "password": "securepass123",
        })
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["role"] == "owner"

    async def test_signup_duplicate_slug(self, client, registered_tenant):
        # Same company name → same slug → should fail
        user = registered_tenant["user"]
        res = await client.post("/api/auth/signup", json={
            "company_name": "Test Company " + user["tenant_slug"].replace("test-company-", ""),
            "owner_name": "Another Owner",
            "owner_email": "another@example.com",
            "password": "pass123456",
        })
        assert res.status_code in [400, 500]

    async def test_login_success(self, client, registered_tenant):
        user = registered_tenant["user"]
        res = await client.post("/api/auth/login", json={
            "email": user["email"],
            "password": "testpass123",
            "tenant_slug": user["tenant_slug"],
        })
        assert res.status_code == 200
        assert "access_token" in res.json()

    async def test_login_wrong_password(self, client, registered_tenant):
        user = registered_tenant["user"]
        res = await client.post("/api/auth/login", json={
            "email": user["email"],
            "password": "wrongpassword",
            "tenant_slug": user["tenant_slug"],
        })
        assert res.status_code == 401

    async def test_login_wrong_slug(self, client, registered_tenant):
        user = registered_tenant["user"]
        res = await client.post("/api/auth/login", json={
            "email": user["email"],
            "password": "testpass123",
            "tenant_slug": "nonexistent-slug-xyz",
        })
        assert res.status_code == 401

    async def test_protected_route_without_token(self, client):
        res = await client.get("/api/leads/")
        assert res.status_code == 401

    async def test_token_refresh(self, client, registered_tenant):
        res = await client.post("/api/auth/refresh", json={
            "refresh_token": registered_tenant["refresh_token"]
        })
        assert res.status_code == 200
        assert "access_token" in res.json()


# ── Tenant tests ────────────────────────────────────────────────────────────

class TestTenant:
    async def test_get_profile(self, client, auth_headers):
        res = await client.get("/api/tenants/me", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "name" in data
        assert "slug" in data

    async def test_update_profile(self, client, auth_headers):
        res = await client.patch("/api/tenants/me", json={"email_from_name": "Support Team"}, headers=auth_headers)
        assert res.status_code == 200

    async def test_list_team(self, client, auth_headers):
        res = await client.get("/api/tenants/team", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)
        assert len(res.json()) >= 1  # At least the owner

    async def test_add_team_member(self, client, auth_headers):
        email = f"agent_{uuid.uuid4().hex[:8]}@test.com"
        res = await client.post("/api/tenants/team", json={
            "name": "New Agent",
            "email": email,
            "role": "agent",
            "password": "agentpass123",
        }, headers=auth_headers)
        assert res.status_code == 201
        assert res.json()["role"] == "agent"


# ── FAQ tests ───────────────────────────────────────────────────────────────

class TestFAQ:
    async def test_create_faq(self, client, auth_headers):
        res = await client.post("/api/faqs/", json={
            "question": "What are your store timings?",
            "answer": "We are open 10am to 8pm Monday to Saturday.",
            "keywords": ["timing", "hours", "open"],
            "category": "General",
        }, headers=auth_headers)
        assert res.status_code == 201
        return res.json()["id"]

    async def test_list_faqs(self, client, auth_headers):
        res = await client.get("/api/faqs/", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_update_faq(self, client, auth_headers):
        # Create first
        create_res = await client.post("/api/faqs/", json={
            "question": "Test Q?",
            "answer": "Test A.",
            "keywords": ["test"],
        }, headers=auth_headers)
        faq_id = create_res.json()["id"]

        res = await client.patch(f"/api/faqs/{faq_id}", json={"category": "Support"}, headers=auth_headers)
        assert res.status_code == 200

    async def test_delete_faq(self, client, auth_headers):
        create_res = await client.post("/api/faqs/", json={
            "question": "Delete me?",
            "answer": "Yes.",
            "keywords": ["delete"],
        }, headers=auth_headers)
        faq_id = create_res.json()["id"]

        res = await client.delete(f"/api/faqs/{faq_id}", headers=auth_headers)
        assert res.status_code == 204

    async def test_faq_keyword_test(self, client, auth_headers):
        create_res = await client.post("/api/faqs/", json={
            "question": "What is the price?",
            "answer": "Prices start at ₹999.",
            "keywords": ["price", "cost", "rate"],
        }, headers=auth_headers)
        faq_id = create_res.json()["id"]

        res = await client.post(f"/api/faqs/{faq_id}/test", json={"message": "what is the price of sofa"}, headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["matched"] is True


# ── Lead tests ──────────────────────────────────────────────────────────────

class TestLeads:
    async def create_contact(self, client, auth_headers) -> str:
        phone = f"+91{uuid.uuid4().int % 9000000000 + 1000000000}"
        res = await client.post("/api/contacts/", json={
            "phone": phone,
            "name": "Test Contact",
            "source": "manual",
        }, headers=auth_headers)
        assert res.status_code == 201
        return res.json()["id"]

    async def test_create_lead(self, client, auth_headers):
        contact_id = await self.create_contact(client, auth_headers)
        res = await client.post("/api/leads/", json={
            "contact_id": contact_id,
            "stage": "new",
            "source": "manual",
        }, headers=auth_headers)
        assert res.status_code == 201

    async def test_list_leads(self, client, auth_headers):
        res = await client.get("/api/leads/", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_lead_stats(self, client, auth_headers):
        res = await client.get("/api/leads/stats", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "total" in data
        assert "by_stage" in data

    async def test_update_lead_stage(self, client, auth_headers):
        contact_id = await self.create_contact(client, auth_headers)
        create_res = await client.post("/api/leads/", json={
            "contact_id": contact_id,
            "stage": "new",
        }, headers=auth_headers)
        lead_id = create_res.json()["id"]

        res = await client.patch(f"/api/leads/{lead_id}", json={"stage": "qualified"}, headers=auth_headers)
        assert res.status_code == 200

    async def test_filter_leads_by_stage(self, client, auth_headers):
        res = await client.get("/api/leads/?stage=new", headers=auth_headers)
        assert res.status_code == 200


# ── Campaign tests ──────────────────────────────────────────────────────────

class TestCampaigns:
    async def test_create_campaign(self, client, auth_headers):
        res = await client.post("/api/campaigns/", json={
            "name": "Test Campaign",
            "template_name": "test_template_v1",
            "template_language": "en",
        }, headers=auth_headers)
        assert res.status_code == 201
        assert res.json()["status"] == "draft"
        return res.json()["id"]

    async def test_list_campaigns(self, client, auth_headers):
        res = await client.get("/api/campaigns/", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_update_campaign(self, client, auth_headers):
        create_res = await client.post("/api/campaigns/", json={
            "name": "Update Me",
            "template_name": "update_template",
        }, headers=auth_headers)
        campaign_id = create_res.json()["id"]

        res = await client.patch(f"/api/campaigns/{campaign_id}", json={"name": "Updated Name"}, headers=auth_headers)
        assert res.status_code == 200

    async def test_delete_draft_campaign(self, client, auth_headers):
        create_res = await client.post("/api/campaigns/", json={
            "name": "Delete Me",
            "template_name": "delete_template",
        }, headers=auth_headers)
        campaign_id = create_res.json()["id"]

        res = await client.delete(f"/api/campaigns/{campaign_id}", headers=auth_headers)
        assert res.status_code == 204


# ── Analytics tests ─────────────────────────────────────────────────────────

class TestAnalytics:
    async def test_dashboard_stats(self, client, auth_headers):
        res = await client.get("/api/analytics/dashboard", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "messages" in data
        assert "leads" in data
        assert "campaigns" in data
        assert "conversations" in data

    async def test_agent_performance(self, client, auth_headers):
        res = await client.get("/api/analytics/agent-performance", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_faq_performance(self, client, auth_headers):
        res = await client.get("/api/analytics/faq-performance", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# ── Health check ────────────────────────────────────────────────────────────

class TestHealth:
    async def test_health(self, client):
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
