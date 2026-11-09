package edu.skillswap;

import edu.skillswap.service.RbacService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RbacServiceTest {

    @Test
    void onlyAdminsReachAdminPanel() {
        assertTrue(RbacService.canAccessAdminPanel("admin"));
        assertFalse(RbacService.canAccessAdminPanel("student"));
        assertFalse(RbacService.canAccessAdminPanel(null));
    }

    @Test
    void ownersAndAdminsPassOwnershipChecks() {
        assertTrue(RbacService.isOwnerOrAdmin("u1", "u1", "student"));
        assertFalse(RbacService.isOwnerOrAdmin("u1", "u2", "student"));
        assertTrue(RbacService.isOwnerOrAdmin("u1", "u2", "admin"));
        assertFalse(RbacService.isOwnerOrAdmin(null, "u2", "admin"));
    }

    @Test
    void onlyAdminsModerate() {
        assertTrue(RbacService.canModerate("admin"));
        assertFalse(RbacService.canModerate("student"));
    }
}
