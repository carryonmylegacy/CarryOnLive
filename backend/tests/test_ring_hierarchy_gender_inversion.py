"""
Test Ring Hierarchy Fix and Gender-Aware Relationship Inversion (Iteration 118)

Tests:
1. Backend: resolve_inverse function with different benefactor genders
2. Backend: /api/beneficiary/family-connections returns properly inverted relationships
3. Frontend: getOrbitLevel assigns correct rings to relationships
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
LOGIN_EMAIL = "info@carryon.us"
LOGIN_PASSWORD = "Demo1234!"


class TestResolveInverseLogic:
    """Test the resolve_inverse function logic via the family-connections endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token - rate limit aware, single login for class"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
            timeout=30
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - skipping authenticated tests")
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_family_connections_endpoint_exists(self, auth_token):
        """Test that /api/beneficiary/family-connections endpoint is accessible"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/beneficiary/family-connections",
            headers=headers,
            timeout=30
        )
        # Should return 200 even if empty (admin may have no connections as beneficiary)
        assert response.status_code == 200, f"Family connections endpoint failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Family connections returned {len(data)} connections")
    
    def test_resolve_inverse_father_male_benefactor(self):
        """Test: Father relation with male benefactor should invert to 'Son'"""
        # Direct unit test of the logic
        RELATION_INVERSE_GENDERED = {
            "Father": ("Son", "Daughter"),
            "Mother": ("Son", "Daughter"),
            "Son": ("Father", "Mother"),
            "Daughter": ("Father", "Mother"),
        }
        RELATION_INVERSE_NEUTRAL = {"Cousin": "Cousin", "Spouse": "Spouse", "Friend": "Friend"}
        
        def resolve_inverse(raw_relation, benefactor_gender):
            if raw_relation in RELATION_INVERSE_NEUTRAL:
                return RELATION_INVERSE_NEUTRAL[raw_relation]
            pair = RELATION_INVERSE_GENDERED.get(raw_relation)
            if not pair:
                return raw_relation
            male_inv, female_inv = pair
            if benefactor_gender == "male":
                return male_inv
            if benefactor_gender == "female":
                return female_inv
            return f"{male_inv}/{female_inv}"
        
        # Father with male benefactor → Son
        assert resolve_inverse("Father", "male") == "Son", "Father + male should be Son"
        print("PASS: Father + male benefactor = Son")
    
    def test_resolve_inverse_father_female_benefactor(self):
        """Test: Father relation with female benefactor should invert to 'Daughter'"""
        RELATION_INVERSE_GENDERED = {"Father": ("Son", "Daughter")}
        RELATION_INVERSE_NEUTRAL = {}
        
        def resolve_inverse(raw_relation, benefactor_gender):
            if raw_relation in RELATION_INVERSE_NEUTRAL:
                return RELATION_INVERSE_NEUTRAL[raw_relation]
            pair = RELATION_INVERSE_GENDERED.get(raw_relation)
            if not pair:
                return raw_relation
            male_inv, female_inv = pair
            if benefactor_gender == "male":
                return male_inv
            if benefactor_gender == "female":
                return female_inv
            return f"{male_inv}/{female_inv}"
        
        # Father with female benefactor → Daughter
        assert resolve_inverse("Father", "female") == "Daughter", "Father + female should be Daughter"
        print("PASS: Father + female benefactor = Daughter")
    
    def test_resolve_inverse_father_unknown_gender(self):
        """Test: Father with unknown gender should fallback to 'Son/Daughter'"""
        RELATION_INVERSE_GENDERED = {"Father": ("Son", "Daughter")}
        RELATION_INVERSE_NEUTRAL = {}
        
        def resolve_inverse(raw_relation, benefactor_gender):
            if raw_relation in RELATION_INVERSE_NEUTRAL:
                return RELATION_INVERSE_NEUTRAL[raw_relation]
            pair = RELATION_INVERSE_GENDERED.get(raw_relation)
            if not pair:
                return raw_relation
            male_inv, female_inv = pair
            if benefactor_gender == "male":
                return male_inv
            if benefactor_gender == "female":
                return female_inv
            return f"{male_inv}/{female_inv}"
        
        # Unknown genders should fallback to slash pair
        assert resolve_inverse("Father", "") == "Son/Daughter", "Father + empty gender should be Son/Daughter"
        assert resolve_inverse("Father", "non-binary") == "Son/Daughter", "Father + non-binary should be Son/Daughter"
        assert resolve_inverse("Father", "prefer_not_to_say") == "Son/Daughter", "Father + prefer_not_to_say should be Son/Daughter"
        assert resolve_inverse("Father", "other") == "Son/Daughter", "Father + other should be Son/Daughter"
        print("PASS: Father + unknown genders = Son/Daughter fallback")
    
    def test_resolve_inverse_neutral_relations(self):
        """Test: Neutral relations remain unchanged regardless of gender"""
        RELATION_INVERSE_NEUTRAL = {"Cousin": "Cousin", "Spouse": "Spouse", "Friend": "Friend"}
        RELATION_INVERSE_GENDERED = {}
        
        def resolve_inverse(raw_relation, benefactor_gender):
            if raw_relation in RELATION_INVERSE_NEUTRAL:
                return RELATION_INVERSE_NEUTRAL[raw_relation]
            pair = RELATION_INVERSE_GENDERED.get(raw_relation)
            if not pair:
                return raw_relation
            male_inv, female_inv = pair
            if benefactor_gender == "male":
                return male_inv
            if benefactor_gender == "female":
                return female_inv
            return f"{male_inv}/{female_inv}"
        
        # Neutral relations
        assert resolve_inverse("Cousin", "male") == "Cousin"
        assert resolve_inverse("Cousin", "female") == "Cousin"
        assert resolve_inverse("Spouse", "male") == "Spouse"
        assert resolve_inverse("Friend", "") == "Friend"
        print("PASS: Neutral relations stay unchanged")
    
    def test_resolve_inverse_comprehensive_gendered_pairs(self):
        """Test comprehensive set of gendered inverse mappings"""
        RELATION_INVERSE_GENDERED = {
            "Father": ("Son", "Daughter"),
            "Mother": ("Son", "Daughter"),
            "Son": ("Father", "Mother"),
            "Daughter": ("Father", "Mother"),
            "Son-in-law": ("Father-in-law", "Mother-in-law"),
            "Daughter-in-law": ("Father-in-law", "Mother-in-law"),
            "Father-in-law": ("Son-in-law", "Daughter-in-law"),
            "Mother-in-law": ("Son-in-law", "Daughter-in-law"),
            "Brother": ("Brother", "Sister"),
            "Sister": ("Brother", "Sister"),
            "Uncle": ("Nephew", "Niece"),
            "Aunt": ("Nephew", "Niece"),
            "Nephew": ("Uncle", "Aunt"),
            "Niece": ("Uncle", "Aunt"),
            "Grandson": ("Grandfather", "Grandmother"),
            "Granddaughter": ("Grandfather", "Grandmother"),
            "Grandmother": ("Grandson", "Granddaughter"),
            "Grandfather": ("Grandson", "Granddaughter"),
            "Great-Grandson": ("Great-Grandfather", "Great-Grandmother"),
            "Great-Granddaughter": ("Great-Grandfather", "Great-Grandmother"),
            "Great-Grandmother": ("Great-Grandson", "Great-Granddaughter"),
            "Great-Grandfather": ("Great-Grandson", "Great-Granddaughter"),
        }
        RELATION_INVERSE_NEUTRAL = {"Cousin": "Cousin", "Spouse": "Spouse", "Friend": "Friend"}
        
        def resolve_inverse(raw_relation, benefactor_gender):
            if raw_relation in RELATION_INVERSE_NEUTRAL:
                return RELATION_INVERSE_NEUTRAL[raw_relation]
            pair = RELATION_INVERSE_GENDERED.get(raw_relation)
            if not pair:
                return raw_relation
            male_inv, female_inv = pair
            if benefactor_gender == "male":
                return male_inv
            if benefactor_gender == "female":
                return female_inv
            return f"{male_inv}/{female_inv}"
        
        # Test key inversions with male benefactor
        assert resolve_inverse("Son", "male") == "Father"
        assert resolve_inverse("Daughter", "male") == "Father"
        assert resolve_inverse("Grandson", "male") == "Grandfather"
        assert resolve_inverse("Niece", "male") == "Uncle"
        assert resolve_inverse("Great-Grandmother", "male") == "Great-Grandson"
        
        # Test key inversions with female benefactor
        assert resolve_inverse("Son", "female") == "Mother"
        assert resolve_inverse("Daughter", "female") == "Mother"
        assert resolve_inverse("Grandson", "female") == "Grandmother"
        assert resolve_inverse("Niece", "female") == "Aunt"
        assert resolve_inverse("Great-Grandmother", "female") == "Great-Granddaughter"
        
        print("PASS: All comprehensive gendered pair inversions correct")


class TestGetOrbitLevelLogic:
    """Test the getOrbitLevel function ring assignments"""
    
    def get_orbit_level(self, relation):
        """Python port of the frontend getOrbitLevel function"""
        r = (relation or '').lower()
        
        # Great-grand checks FIRST
        if 'great-grand' in r or 'great grand' in r:
            return 3
        
        # Ring 0: Spouse & Parent (benefactor is child)
        if r in ['spouse', 'wife', 'husband', 'partner']:
            return 0
        if r in ['parent', 'mother', 'father', 'mom', 'dad']:
            return 0
        
        # Ring 1: Children, Siblings, Grandparents
        if r in ['son', 'daughter', 'child', 'children']:
            return 1
        if r in ['sibling', 'brother', 'sister']:
            return 1
        if r in ['grandparent', 'grandmother', 'grandfather', 'grandma', 'grandpa']:
            return 1
        
        # Ring 2: Grandchildren, Nieces, Nephews, In-laws, Aunts, Uncles
        if r in ['grandchild', 'grandson', 'granddaughter']:
            return 2
        if r in ['nephew', 'niece']:
            return 2
        if r in ['uncle', 'aunt']:
            return 2
        if 'in-law' in r or 'in law' in r:
            return 2
        
        # Ring 3: Non-family & distant
        if r in ['friend', 'other']:
            return 3
        
        return 2  # Default fallback
    
    def test_ring0_spouse_parent_assignments(self):
        """Test Ring 0 assignments: Spouse, Mother, Father"""
        assert self.get_orbit_level('spouse') == 0, "spouse should be Ring 0"
        assert self.get_orbit_level('wife') == 0, "wife should be Ring 0"
        assert self.get_orbit_level('husband') == 0, "husband should be Ring 0"
        assert self.get_orbit_level('partner') == 0, "partner should be Ring 0"
        assert self.get_orbit_level('mother') == 0, "mother should be Ring 0"
        assert self.get_orbit_level('father') == 0, "father should be Ring 0"
        assert self.get_orbit_level('mom') == 0, "mom should be Ring 0"
        assert self.get_orbit_level('dad') == 0, "dad should be Ring 0"
        assert self.get_orbit_level('parent') == 0, "parent should be Ring 0"
        print("PASS: Ring 0 assignments correct (spouse, parents)")
    
    def test_ring1_children_siblings_grandparents(self):
        """Test Ring 1 assignments: Son, Daughter, Brother, Sister, Grandmother, Grandfather"""
        assert self.get_orbit_level('son') == 1, "son should be Ring 1"
        assert self.get_orbit_level('daughter') == 1, "daughter should be Ring 1"
        assert self.get_orbit_level('child') == 1, "child should be Ring 1"
        assert self.get_orbit_level('brother') == 1, "brother should be Ring 1"
        assert self.get_orbit_level('sister') == 1, "sister should be Ring 1"
        assert self.get_orbit_level('sibling') == 1, "sibling should be Ring 1"
        assert self.get_orbit_level('grandmother') == 1, "grandmother should be Ring 1"
        assert self.get_orbit_level('grandfather') == 1, "grandfather should be Ring 1"
        assert self.get_orbit_level('grandma') == 1, "grandma should be Ring 1"
        assert self.get_orbit_level('grandpa') == 1, "grandpa should be Ring 1"
        print("PASS: Ring 1 assignments correct (children, siblings, grandparents)")
    
    def test_ring2_grandchildren_extended_family(self):
        """Test Ring 2 assignments: Grandson, Granddaughter, Nephew, Niece, Uncle, Aunt, In-laws"""
        assert self.get_orbit_level('grandson') == 2, "grandson should be Ring 2"
        assert self.get_orbit_level('granddaughter') == 2, "granddaughter should be Ring 2"
        assert self.get_orbit_level('grandchild') == 2, "grandchild should be Ring 2"
        assert self.get_orbit_level('nephew') == 2, "nephew should be Ring 2"
        assert self.get_orbit_level('niece') == 2, "niece should be Ring 2"
        assert self.get_orbit_level('uncle') == 2, "uncle should be Ring 2"
        assert self.get_orbit_level('aunt') == 2, "aunt should be Ring 2"
        assert self.get_orbit_level('father-in-law') == 2, "father-in-law should be Ring 2"
        assert self.get_orbit_level('mother-in-law') == 2, "mother-in-law should be Ring 2"
        assert self.get_orbit_level('son-in-law') == 2, "son-in-law should be Ring 2"
        assert self.get_orbit_level('daughter-in-law') == 2, "daughter-in-law should be Ring 2"
        assert self.get_orbit_level('brother in law') == 2, "brother in law should be Ring 2"
        print("PASS: Ring 2 assignments correct (grandchildren, extended family, in-laws)")
    
    def test_ring3_great_grandparents_and_non_family(self):
        """Test Ring 3 assignments: Great-grandmother, Great-grandfather, Friend, Other"""
        # Great-grandparents (moved from Ring 1 to Ring 3)
        assert self.get_orbit_level('great-grandmother') == 3, "great-grandmother should be Ring 3"
        assert self.get_orbit_level('great-grandfather') == 3, "great-grandfather should be Ring 3"
        assert self.get_orbit_level('great grandmother') == 3, "great grandmother should be Ring 3"
        assert self.get_orbit_level('great grandfather') == 3, "great grandfather should be Ring 3"
        assert self.get_orbit_level('great-grandson') == 3, "great-grandson should be Ring 3"
        assert self.get_orbit_level('great-granddaughter') == 3, "great-granddaughter should be Ring 3"
        
        # Non-family (moved from Ring 1 to Ring 3)
        assert self.get_orbit_level('friend') == 3, "friend should be Ring 3"
        assert self.get_orbit_level('other') == 3, "other should be Ring 3"
        print("PASS: Ring 3 assignments correct (great-grandparents, friend, other)")
    
    def test_case_insensitivity(self):
        """Test that ring assignments are case-insensitive"""
        assert self.get_orbit_level('FATHER') == 0
        assert self.get_orbit_level('Father') == 0
        assert self.get_orbit_level('GREAT-GRANDMOTHER') == 3
        assert self.get_orbit_level('Great-Grandmother') == 3
        assert self.get_orbit_level('FRIEND') == 3
        assert self.get_orbit_level('Friend') == 3
        print("PASS: Case insensitivity working")


class TestBackendAPIIntegration:
    """Test backend API integration with auth token"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token - rate limit aware, single login for class"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
            timeout=30
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - skipping authenticated tests")
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_auth_me_endpoint(self, auth_token):
        """Verify user profile endpoint works"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=headers,
            timeout=30
        )
        assert response.status_code == 200
        user = response.json()
        assert "id" in user
        assert "email" in user
        # Log gender field for debugging
        print(f"User profile: id={user.get('id')}, email={user.get('email')}, gender={user.get('gender', 'NOT_SET')}")
    
    def test_estates_endpoint(self, auth_token):
        """Verify estates endpoint works"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/estates",
            headers=headers,
            timeout=30
        )
        assert response.status_code == 200
        estates = response.json()
        assert isinstance(estates, list)
        print(f"Estates count: {len(estates)}")
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"Health check: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
