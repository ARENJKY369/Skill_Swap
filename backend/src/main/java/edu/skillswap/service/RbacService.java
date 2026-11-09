package edu.skillswap.service;

/** Java mirror of shared/rbac.ts. */
public final class RbacService {

    private RbacService() {}

    public static boolean canAccessAdminPanel(String role) {
        return "admin".equals(role);
    }

    public static boolean isOwnerOrAdmin(String actorId, String ownerId, String role) {
        if (actorId == null) {
            return false;
        }
        if ("admin".equals(role)) {
            return true;
        }
        return actorId.equals(ownerId);
    }

    public static boolean canModerate(String role) {
        return "admin".equals(role);
    }
}
