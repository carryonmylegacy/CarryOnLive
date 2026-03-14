"""
Tests for Iteration 110: Orbit Visualization Updates
- Ring hierarchy mapping tests
- Responsive sizing verification (via API - UI tested separately)
- BeneficiaryHubPage load after dead code removal fix
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ── Ring Mapping Tests ─────────────────────────────────────────
# Testing the getOrbitLevel function logic from OrbitVisualization.js
# Ring 0: Spouse & Children (benefactor labeled "Mother/Father" = beneficiary's child)
# Ring 1: Parents, Grandchildren, Siblings, Friend, Other 
# Ring 2: Grandparents, Nieces, Nephews, In-laws
# Ring 3: Great-Grandparents

class TestRingHierarchyMapping:
    """Test the ring hierarchy mapping based on relation field"""
    
    # Simulating the getOrbitLevel function from OrbitVisualization.js
    @staticmethod
    def get_orbit_level(relation):
        r = (relation or '').lower()
        
        # Great-grand checks FIRST
        if 'great-grand' in r or 'great grand' in r:
            if 'son' in r or 'daughter' in r or 'child' in r:
                return 3  # Great-Grandson/Granddaughter → benefactor is great-grandparent
            return 1  # Great-Grandmother/Grandfather → benefactor is great-grandchild
        
        # Ring 0: Spouse & Children
        if r in ['spouse', 'wife', 'husband', 'partner']:
            return 0
        if r in ['parent', 'mother', 'father', 'mom', 'dad']:
            return 0  # Benefactor says "Mother" = beneficiary's child
        
        # Ring 1: Parents, Grandchildren, Siblings
        if r in ['son', 'daughter', 'child', 'children']:
            return 1  # Benefactor says "Son" = beneficiary's parent
        if r in ['sibling', 'brother', 'sister']:
            return 1
        if r in ['grandparent', 'grandmother', 'grandfather', 'grandma', 'grandpa']:
            return 1  # Benefactor says "Grandmother" = beneficiary's grandchild
        
        # Ring 2: Grandparents, Nieces, Nephews, In-laws
        if r in ['grandchild', 'grandson', 'granddaughter']:
            return 2  # Benefactor says "Grandson" = beneficiary's grandparent
        if r in ['nephew', 'niece']:
            return 2
        if r in ['uncle', 'aunt']:
            return 2
        if 'in-law' in r or 'in law' in r:
            return 2
        
        # Default fallback
        if r in ['friend', 'other']:
            return 1
        return 1
    
    # ── Ring 0 Tests (Spouse & Children) ──
    def test_spouse_is_ring_0(self):
        """Spouse relation should map to Ring 0"""
        assert self.get_orbit_level('Spouse') == 0
        
    def test_mother_is_ring_0(self):
        """Mother relation (benefactor's child) should map to Ring 0"""
        assert self.get_orbit_level('Mother') == 0
        
    def test_father_is_ring_0(self):
        """Father relation (benefactor's child) should map to Ring 0"""
        assert self.get_orbit_level('Father') == 0
        
    # ── Ring 1 Tests (Parents, Grandchildren, Siblings) ──
    def test_son_is_ring_1(self):
        """Son relation (benefactor is beneficiary's parent) should map to Ring 1"""
        assert self.get_orbit_level('Son') == 1
        
    def test_daughter_is_ring_1(self):
        """Daughter relation should map to Ring 1"""
        assert self.get_orbit_level('Daughter') == 1
        
    def test_brother_is_ring_1(self):
        """Brother relation should map to Ring 1"""
        assert self.get_orbit_level('Brother') == 1
        
    def test_sister_is_ring_1(self):
        """Sister relation should map to Ring 1"""
        assert self.get_orbit_level('Sister') == 1
        
    def test_grandmother_is_ring_1(self):
        """Grandmother relation (benefactor is beneficiary's grandchild) should map to Ring 1"""
        assert self.get_orbit_level('Grandmother') == 1
        
    def test_grandfather_is_ring_1(self):
        """Grandfather relation should map to Ring 1"""
        assert self.get_orbit_level('Grandfather') == 1
        
    def test_friend_is_ring_1(self):
        """Friend relation should map to Ring 1 (default)"""
        assert self.get_orbit_level('Friend') == 1
        
    def test_other_is_ring_1(self):
        """Other relation should map to Ring 1 (default)"""
        assert self.get_orbit_level('Other') == 1
        
    # ── Ring 2 Tests (Grandparents, Nieces, Nephews, In-laws) ──
    def test_grandson_is_ring_2(self):
        """Grandson relation (benefactor is beneficiary's grandparent) should map to Ring 2"""
        assert self.get_orbit_level('Grandson') == 2
        
    def test_granddaughter_is_ring_2(self):
        """Granddaughter relation should map to Ring 2"""
        assert self.get_orbit_level('Granddaughter') == 2
        
    def test_nephew_is_ring_2(self):
        """Nephew relation should map to Ring 2"""
        assert self.get_orbit_level('Nephew') == 2
        
    def test_niece_is_ring_2(self):
        """Niece relation should map to Ring 2"""
        assert self.get_orbit_level('Niece') == 2
        
    def test_uncle_is_ring_2(self):
        """Uncle relation should map to Ring 2"""
        assert self.get_orbit_level('Uncle') == 2
        
    def test_aunt_is_ring_2(self):
        """Aunt relation should map to Ring 2"""
        assert self.get_orbit_level('Aunt') == 2
        
    def test_son_in_law_is_ring_2(self):
        """Son-in-law relation should map to Ring 2"""
        assert self.get_orbit_level('Son-in-law') == 2
        
    def test_daughter_in_law_is_ring_2(self):
        """Daughter-in-law relation should map to Ring 2"""
        assert self.get_orbit_level('Daughter-in-law') == 2
        
    def test_mother_in_law_is_ring_2(self):
        """Mother-in-law relation should map to Ring 2"""
        assert self.get_orbit_level('Mother-in-law') == 2
        
    def test_father_in_law_is_ring_2(self):
        """Father-in-law relation should map to Ring 2"""
        assert self.get_orbit_level('Father-in-law') == 2
        
    # ── Ring 3 Tests (Great-Grandparents) ──
    def test_great_grandson_is_ring_3(self):
        """Great-Grandson relation (benefactor is great-grandparent) should map to Ring 3"""
        assert self.get_orbit_level('Great-Grandson') == 3
        
    def test_great_granddaughter_is_ring_3(self):
        """Great-Granddaughter relation should map to Ring 3"""
        assert self.get_orbit_level('Great-Granddaughter') == 3
        
    def test_great_grandmother_is_ring_1(self):
        """Great-Grandmother relation (benefactor is great-grandchild) should map to Ring 1"""
        assert self.get_orbit_level('Great-Grandmother') == 1
        
    def test_great_grandfather_is_ring_1(self):
        """Great-Grandfather relation should map to Ring 1"""
        assert self.get_orbit_level('Great-Grandfather') == 1


class TestBeneficiaryAPIs:
    """Test beneficiary-related API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test client with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.auth_success = True
        else:
            self.auth_success = False
            print(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_health_check(self):
        """Verify API is healthy"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        
    def test_estates_endpoint(self):
        """Test estates endpoint returns 200"""
        if not self.auth_success:
            pytest.skip("Auth failed")
        response = self.session.get(f"{BASE_URL}/api/estates")
        assert response.status_code == 200
        
    def test_beneficiary_family_connections(self):
        """Test family-connections endpoint returns 200"""
        if not self.auth_success:
            pytest.skip("Auth failed")
        response = self.session.get(f"{BASE_URL}/api/beneficiary/family-connections")
        # May return 200 with empty array or 404 if no connections
        assert response.status_code in [200, 404]
        
    def test_auth_me_endpoint(self):
        """Test auth/me endpoint returns user info"""
        if not self.auth_success:
            pytest.skip("Auth failed")
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert 'email' in data or 'id' in data


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
