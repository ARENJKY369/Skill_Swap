package edu.skillswap.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/** Strict DTOs (global Jackson FAIL_ON_UNKNOWN_PROPERTIES mirrors Zod .strict()). */
public final class Requests {

    private static final String UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
    private static final String PASSWORD = "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,128}$";
    private static final String DATE = "^\\d{4}-\\d{2}-\\d{2}$";
    private static final String TIME = "^([01]\\d|2[0-3]):[0-5]\\d$";
    private static final String CATEGORY = "^(Tech|Arts|Languages|Business|Design)$";

    private Requests() {}

    public static class Signup {
        @NotBlank @Size(min = 2, max = 80) public String name;
        @NotBlank @Email @Size(max = 160) public String email;
        @NotBlank @Pattern(regexp = PASSWORD, message = "Password must be 10+ chars with uppercase, lowercase and a digit") public String password;
        @Size(max = 80) public String major = "";
    }

    public static class Login {
        @NotBlank @Size(min = 3, max = 160) public String identifier;
        @NotBlank @Size(max = 128) public String password;
        public boolean rememberMe = false;
    }

    public static class ChangePassword {
        @NotBlank @Size(max = 128) public String currentPassword;
        @NotBlank @Pattern(regexp = PASSWORD, message = "Password must be 10+ chars with uppercase, lowercase and a digit") public String newPassword;
    }

    public static class VerifyEmail {
        @NotBlank @Email public String email;
        @NotBlank @Pattern(regexp = "^\\d{6}$") public String code;
    }

    public static class EmailBody {
        @NotBlank @Email public String email;
    }

    public static class ResetPassword {
        @NotBlank @Email public String email;
        @NotBlank @Pattern(regexp = "^\\d{6}$") public String code;
        @NotBlank @Pattern(regexp = PASSWORD, message = "Password must be 10+ chars with uppercase, lowercase and a digit") public String password;
    }

    public static class TwoFactor {
        @NotBlank @Size(min = 10, max = 200) public String mfaToken;
        @NotBlank @Size(min = 6, max = 24) public String code;
    }

    public static class TwoFactorEnable {
        @NotBlank @Pattern(regexp = "^\\d{6}$") public String code;
    }

    public static class PasswordBody {
        @NotBlank @Size(max = 128) public String password;
    }

    public static class AccountDelete {
        @NotBlank @Size(max = 128) public String password;
        @NotBlank @Pattern(regexp = "^DELETE$") public String confirmText;
    }

    public static class ProfilePatch {
        @Size(min = 2, max = 80) public String name;
        @Size(max = 300) public String bio;
        @Size(max = 80) public String major;
        @Size(max = 120) public String university;
        @Pattern(regexp = "^(1st year|2nd year|3rd year|4th year|Graduate)$") public String year;
        @Size(max = 30) public List<@NotBlank @Size(max = 60) String> teaches;
        @Size(max = 30) public List<@NotBlank @Size(max = 60) String> wants;
        public Map<String, @Pattern(regexp = "^(low|med|high)$") String> teachLevels;
        public Map<String, @Pattern(regexp = "^(low|med|high)$") String> wantLevels;
        public String clientUpdatedAt;
    }

    public static class Avatar {
        @NotBlank @Size(max = 2_800_000)
        @Pattern(regexp = "^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$")
        public String dataUrl;
    }

    public static class Connect {
        @Size(max = 60) public String skill;
        @Size(max = 280) public String message = "";
    }

    public static class ConnectionRequestAction {
        @NotBlank @Pattern(regexp = "^(accept|decline)$") public String action;
    }

    public static class CreateSession {
        @NotBlank @Pattern(regexp = UUID) public String recipientId;
        @NotBlank @Size(min = 1, max = 80) public String skillId;
        @NotBlank @Pattern(regexp = DATE, message = "Use YYYY-MM-DD") public String date;
        @NotBlank @Pattern(regexp = TIME, message = "Use 24h HH:MM") public String time;
        @NotNull @Min(15) @Max(180) public Integer durationMin;
        @Size(max = 500) public String message = "";
        @Size(max = 300) public String meetingUrl;
    }

    public static class SessionAction {
        @NotBlank @Pattern(regexp = "^(accept|decline|reschedule|complete|cancel)$") public String action;
        @Pattern(regexp = DATE) public String date;
        @Pattern(regexp = TIME) public String time;
        @Size(max = 200) public String reason;
    }

    public static class CreateReview {
        @NotBlank @Pattern(regexp = UUID) public String sessionId;
        @NotNull @Min(1) @Max(5) public Integer punctuality;
        @NotNull @Min(1) @Max(5) public Integer clarity;
        @NotNull @Min(1) @Max(5) public Integer engagement;
        @NotNull @Min(1) @Max(5) public Integer overall;
        @Size(max = 500) public String text = "";
    }

    public static class AdminModify {
        @NotBlank @Pattern(regexp = "^(setRole|restrict|unrestrict)$") public String action;
        @Pattern(regexp = "^(student|admin)$") public String role;
        @Size(max = 200) public String reason;
    }

    public static class AddSkill {
        @NotBlank @Size(min = 2, max = 60) public String name;
        @NotBlank @Pattern(regexp = CATEGORY) public String category;
    }
}
