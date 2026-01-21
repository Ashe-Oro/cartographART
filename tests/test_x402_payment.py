"""
Tests for x402 payment enforcement on the poster creation API.

These tests verify that:
1. The /api/posters endpoint requires payment (returns 402 without X-PAYMENT header)
2. Invalid payment headers are rejected
3. Payment cannot be bypassed through parameter manipulation
4. Other endpoints (themes, jobs, health) do NOT require payment
"""

import pytest
import base64
import json
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock

from app.main import app


@pytest.fixture
def valid_poster_request():
    """Valid poster request payload."""
    return {
        "city": "San Francisco",
        "country": "USA",
        "theme": "blueprint",
        "size": "auto"
    }


@pytest.fixture
def valid_poster_request_with_state():
    """Valid poster request with optional state field."""
    return {
        "city": "Austin",
        "state": "Texas",
        "country": "USA",
        "theme": "noir",
        "size": "city"
    }


class TestPaymentRequired:
    """Tests verifying that payment is required for poster creation."""

    @pytest.mark.asyncio
    async def test_create_poster_without_payment_returns_402(self, valid_poster_request):
        """POST /api/posters without X-PAYMENT header must return 402."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request
            )

        assert response.status_code == 402, (
            f"Expected 402 Payment Required, got {response.status_code}. "
            "Endpoint may be unprotected!"
        )

        # Verify 402 response contains payment requirements
        data = response.json()
        assert "accepts" in data, "402 response should contain payment requirements"
        assert data["x402Version"] == 1, "Should be x402 version 1"

    @pytest.mark.asyncio
    async def test_create_poster_with_empty_payment_header_returns_402(self, valid_poster_request):
        """POST /api/posters with empty X-PAYMENT header must return 402."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request,
                headers={"X-PAYMENT": ""}
            )

        assert response.status_code == 402, (
            f"Expected 402 with empty X-PAYMENT header, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_create_poster_with_invalid_base64_payment_rejected(self, valid_poster_request):
        """POST /api/posters with invalid base64 in X-PAYMENT must be rejected."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request,
                headers={"X-PAYMENT": "not-valid-base64!!!"}
            )

        # Should return 402 or 400, not 200
        assert response.status_code in [400, 402], (
            f"Expected 400/402 with invalid base64, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_create_poster_with_malformed_json_payment_rejected(self, valid_poster_request):
        """POST /api/posters with malformed JSON in X-PAYMENT must be rejected."""
        # Base64 encode invalid JSON
        invalid_json = base64.b64encode(b"not valid json {{{").decode()

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request,
                headers={"X-PAYMENT": invalid_json}
            )

        assert response.status_code in [400, 402], (
            f"Expected 400/402 with malformed JSON payment, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_create_poster_with_missing_signature_rejected(self, valid_poster_request):
        """POST /api/posters with payment missing signature must be rejected."""
        # Valid structure but missing signature
        payment_data = {
            "x402Version": 1,
            "scheme": "exact",
            "network": "base-sepolia",
            "payload": {
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x1234567890123456789012345678901234567890",
                    "value": "1000",
                    "validAfter": "0",
                    "validBefore": "9999999999",
                    "nonce": "0x" + "00" * 32
                }
                # Missing "signature" field
            }
        }
        payment_header = base64.b64encode(json.dumps(payment_data).encode()).decode()

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request,
                headers={"X-PAYMENT": payment_header}
            )

        assert response.status_code in [400, 402, 500], (
            f"Expected rejection with missing signature, got {response.status_code}"
        )
        assert response.status_code != 200, "Should NOT return 200 without valid signature"

    @pytest.mark.asyncio
    async def test_create_poster_with_invalid_signature_rejected(self, valid_poster_request):
        """POST /api/posters with invalid signature must be rejected."""
        # Valid structure but with obviously invalid signature
        payment_data = {
            "x402Version": 1,
            "scheme": "exact",
            "network": "base-sepolia",
            "payload": {
                "signature": "0x" + "00" * 65,  # Invalid signature (all zeros)
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x1234567890123456789012345678901234567890",
                    "value": "1000",
                    "validAfter": "0",
                    "validBefore": "9999999999",
                    "nonce": "0x" + "ab" * 32
                },
                "eip712Domain": {
                    "name": "USDC",
                    "version": "2",
                    "chainId": 84532,
                    "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
                }
            }
        }
        payment_header = base64.b64encode(json.dumps(payment_data).encode()).decode()

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request,
                headers={"X-PAYMENT": payment_header}
            )

        # The facilitator should reject invalid signatures
        # Response could be 400 (bad request) or 402 (payment failed) or 500 (facilitator error)
        assert response.status_code != 200, (
            "Should NOT return 200 with invalid signature - payment bypass possible!"
        )


class TestPaymentBypassAttempts:
    """Tests for various payment bypass attempts."""

    @pytest.mark.asyncio
    async def test_cannot_bypass_payment_with_extra_headers(self, valid_poster_request):
        """Attempt to bypass payment with various header manipulations."""
        bypass_headers = [
            {"X-Forwarded-For": "127.0.0.1"},
            {"X-Real-IP": "127.0.0.1"},
            {"X-Payment-Bypass": "true"},
            {"Authorization": "Bearer admin"},
            {"X-Admin": "true"},
            {"X-Internal": "true"},
            {"X-Skip-Payment": "1"},
        ]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            for headers in bypass_headers:
                response = await client.post(
                    "/api/posters",
                    json=valid_poster_request,
                    headers=headers
                )

                assert response.status_code == 402, (
                    f"Payment bypassed with headers {headers}! Got {response.status_code}"
                )

    @pytest.mark.asyncio
    async def test_cannot_bypass_payment_with_query_params(self, valid_poster_request):
        """Attempt to bypass payment with query parameters."""
        bypass_params = [
            "?skip_payment=true",
            "?admin=true",
            "?free=1",
            "?bypass=1",
            "?test=true",
            "?paid=true",
        ]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            for params in bypass_params:
                response = await client.post(
                    f"/api/posters{params}",
                    json=valid_poster_request
                )

                assert response.status_code == 402, (
                    f"Payment bypassed with params {params}! Got {response.status_code}"
                )

    @pytest.mark.asyncio
    async def test_cannot_bypass_payment_with_body_manipulation(self):
        """Attempt to bypass payment with extra body fields."""
        bypass_payloads = [
            {"city": "Test", "country": "US", "theme": "blueprint", "paid": True},
            {"city": "Test", "country": "US", "theme": "blueprint", "skip_payment": True},
            {"city": "Test", "country": "US", "theme": "blueprint", "free": True},
            {"city": "Test", "country": "US", "theme": "blueprint", "admin": True},
            {"city": "Test", "country": "US", "theme": "blueprint", "payment_confirmed": True},
        ]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            for payload in bypass_payloads:
                response = await client.post(
                    "/api/posters",
                    json=payload
                )

                assert response.status_code == 402, (
                    f"Payment bypassed with payload field! Got {response.status_code}"
                )

    @pytest.mark.asyncio
    async def test_cannot_use_different_http_methods_to_bypass(self, valid_poster_request):
        """Attempt to use different HTTP methods to bypass payment."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            # PUT should not work for creating posters
            response = await client.put(
                "/api/posters",
                json=valid_poster_request
            )
            assert response.status_code in [405, 404], (
                f"PUT method should not be allowed, got {response.status_code}"
            )

            # PATCH should not work for creating posters
            response = await client.patch(
                "/api/posters",
                json=valid_poster_request
            )
            assert response.status_code in [405, 404], (
                f"PATCH method should not be allowed, got {response.status_code}"
            )

    @pytest.mark.asyncio
    async def test_cannot_bypass_via_path_manipulation(self, valid_poster_request):
        """Attempt path traversal or manipulation to bypass payment."""
        bypass_paths = [
            "/api/posters/",
            "/api/posters//",
            "/api//posters",
            "/api/posters/../posters",
            "/API/POSTERS",  # Case sensitivity
        ]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            for path in bypass_paths:
                response = await client.post(
                    path,
                    json=valid_poster_request
                )

                # Should either be 402 (payment required) or 404/307 (not found/redirect)
                assert response.status_code in [402, 404, 307, 405], (
                    f"Unexpected response for path {path}: {response.status_code}"
                )
                if response.status_code == 200:
                    pytest.fail(f"Payment bypassed via path {path}!")


class TestNonPaymentEndpoints:
    """Tests verifying that other endpoints do NOT require payment."""

    @pytest.mark.asyncio
    async def test_themes_endpoint_no_payment_required(self):
        """GET /api/themes should NOT require payment."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/api/themes")

        assert response.status_code == 200, (
            f"Themes endpoint should not require payment, got {response.status_code}"
        )
        data = response.json()
        assert "themes" in data

    @pytest.mark.asyncio
    async def test_health_endpoint_no_payment_required(self):
        """GET /health should NOT require payment."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/health")

        assert response.status_code == 200, (
            f"Health endpoint should not require payment, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_jobs_status_endpoint_no_payment_required(self):
        """GET /api/jobs/{job_id} should NOT require payment (returns 404 for unknown job)."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/api/jobs/nonexistent-job-id")

        # Should be 404 (not found), not 402 (payment required)
        assert response.status_code == 404, (
            f"Jobs endpoint should not require payment, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_poster_download_no_payment_required(self):
        """GET /api/posters/{job_id} should NOT require payment (returns 404 for unknown)."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get("/api/posters/nonexistent-job-id")

        # Should be 404 (not found), not 402 (payment required)
        assert response.status_code == 404, (
            f"Poster download should not require payment, got {response.status_code}"
        )


class TestPaymentResponseFormat:
    """Tests for the 402 response format and payment requirements."""

    @pytest.mark.asyncio
    async def test_402_response_contains_required_fields(self, valid_poster_request):
        """Verify 402 response contains all required x402 fields."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request
            )

        assert response.status_code == 402
        data = response.json()

        # Required top-level fields
        assert "x402Version" in data
        assert "accepts" in data
        assert isinstance(data["accepts"], list)
        assert len(data["accepts"]) > 0

        # Required fields in payment scheme
        scheme = data["accepts"][0]
        required_fields = ["scheme", "network", "maxAmountRequired", "payTo", "asset"]
        for field in required_fields:
            assert field in scheme, f"Missing required field: {field}"

    @pytest.mark.asyncio
    async def test_402_response_has_correct_network(self, valid_poster_request):
        """Verify 402 response specifies the correct network."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request
            )

        data = response.json()
        scheme = data["accepts"][0]

        # Should be base-sepolia for testing
        assert scheme["network"] in ["base-sepolia", "base"], (
            f"Unexpected network: {scheme['network']}"
        )

    @pytest.mark.asyncio
    async def test_402_response_has_usdc_asset(self, valid_poster_request):
        """Verify 402 response specifies USDC as the payment asset."""
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/posters",
                json=valid_poster_request
            )

        data = response.json()
        scheme = data["accepts"][0]

        # USDC contract addresses
        usdc_addresses = [
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # Base Sepolia
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # Base Mainnet
        ]
        assert scheme["asset"].lower() in [addr.lower() for addr in usdc_addresses], (
            f"Unexpected asset address: {scheme['asset']}"
        )


class TestDecoratorApplication:
    """Tests verifying the @pay decorator is correctly applied."""

    def test_pay_decorator_applied_to_create_poster(self):
        """Verify @pay decorator is applied to create_poster route."""
        from app.routers.posters import router

        # Find the create_poster route (path includes /api prefix from router)
        create_poster_route = None
        for route in router.routes:
            if hasattr(route, 'path') and "/posters" in route.path and "POST" in getattr(route, 'methods', set()):
                create_poster_route = route
                break

        assert create_poster_route is not None, "create_poster route not found"

        # The @pay decorator modifies the docstring to include payment info
        # and the middleware enforces payment - verify via docstring and functional test
        description = create_poster_route.description or ""
        assert "payment" in description.lower() or "usdc" in description.lower(), (
            "create_poster route description should mention payment requirement"
        )

        # Verify the import of @pay decorator exists in the module
        from app.routers import posters
        import inspect
        source = inspect.getsource(posters)
        assert "@pay" in source, "@pay decorator not found in posters.py source"
        assert "from fastapi_x402 import pay" in source or "from fastapi_x402 import" in source, (
            "fastapi_x402 pay import not found in posters.py"
        )

    def test_other_routes_not_decorated_with_pay(self):
        """Verify other routes do NOT have @pay decorator."""
        from app.routers.themes import router as themes_router
        from app.routers.jobs import router as jobs_router

        # Themes routes should not require payment
        for route in themes_router.routes:
            if hasattr(route, 'endpoint'):
                assert not hasattr(route.endpoint, '_x402_price'), (
                    f"Theme route {route.path} should not have @pay decorator"
                )

        # Jobs routes should not require payment
        for route in jobs_router.routes:
            if hasattr(route, 'endpoint'):
                assert not hasattr(route.endpoint, '_x402_price'), (
                    f"Jobs route {route.path} should not have @pay decorator"
                )
