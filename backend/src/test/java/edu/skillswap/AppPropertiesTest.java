package edu.skillswap;

import edu.skillswap.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AppPropertiesTest {

    @Test
    void readsOAuthCredentialsFromSpringProperties() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("skillswap.oauth.google.client-id", "google-id")
                .withProperty("skillswap.oauth.google.client-secret", "google-secret")
                .withProperty("skillswap.oauth.facebook.client-id", "facebook-id")
                .withProperty("skillswap.oauth.facebook.client-secret", "facebook-secret")
                .withProperty("skillswap.oauth.twitter.client-id", "x-id")
                .withProperty("skillswap.oauth.twitter.client-secret", "x-secret")
                .withProperty("skillswap.oauth.linkedin.client-id", "linkedin-id")
                .withProperty("skillswap.oauth.linkedin.client-secret", "linkedin-secret");

        AppProperties properties = new AppProperties(environment);

        assertEquals("google-id", properties.getGoogleClientId());
        assertEquals("google-secret", properties.getGoogleClientSecret());
        assertEquals("facebook-id", properties.getFacebookClientId());
        assertEquals("facebook-secret", properties.getFacebookClientSecret());
        assertEquals("x-id", properties.getTwitterClientId());
        assertEquals("x-secret", properties.getTwitterClientSecret());
        assertEquals("linkedin-id", properties.getLinkedinClientId());
        assertEquals("linkedin-secret", properties.getLinkedinClientSecret());
    }

    @Test
    void leavesOAuthProvidersUnconfiguredWhenCredentialsAreMissing() {
        AppProperties properties = new AppProperties(new StandardEnvironment());

        assertEquals("", properties.getGoogleClientId());
        assertEquals("", properties.getGoogleClientSecret());
        assertEquals("", properties.getFacebookClientId());
        assertEquals("", properties.getFacebookClientSecret());
        assertEquals("", properties.getTwitterClientId());
        assertEquals("", properties.getTwitterClientSecret());
    }
}
