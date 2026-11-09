package edu.skillswap;

import edu.skillswap.service.DbSupport;
import edu.skillswap.service.SessionStateMachine;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionStateMachineTest {

    @Test
    void allowsHappyPath() {
        assertTrue(SessionStateMachine.canTransition("Pending", "Accepted"));
        assertTrue(SessionStateMachine.canTransition("Accepted", "Completed"));
    }

    @Test
    void allowsDeclineFromPending() {
        assertTrue(SessionStateMachine.canTransition("Pending", "Declined"));
    }

    @Test
    void forbidsSkippingAccepted() {
        assertFalse(SessionStateMachine.canTransition("Pending", "Completed"));
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> SessionStateMachine.assertTransition("Pending", "Completed"));
        assertTrue(error.getMessage().contains("Invalid session transition"));
    }

    @Test
    void terminalStatesHaveNoOutboundTransitions() {
        for (String to : new String[]{"Pending", "Accepted", "Rescheduled", "Completed", "Declined"}) {
            assertFalse(SessionStateMachine.canTransition("Completed", to));
            assertFalse(SessionStateMachine.canTransition("Declined", to));
        }
    }

    @Test
    void reschedulingLoopsBack() {
        assertTrue(SessionStateMachine.canTransition("Pending", "Rescheduled"));
        assertTrue(SessionStateMachine.canTransition("Accepted", "Rescheduled"));
        assertTrue(SessionStateMachine.canTransition("Rescheduled", "Accepted"));
    }

    @Test
    void canMarkCompletedRequiresPastEndTime() {
        String past = DbSupport.iso(Instant.now().minusSeconds(60));
        String future = DbSupport.iso(Instant.now().plusSeconds(3600));
        assertTrue(SessionStateMachine.canMarkCompleted("Accepted", past));
        assertFalse(SessionStateMachine.canMarkCompleted("Accepted", future));
        assertFalse(SessionStateMachine.canMarkCompleted("Pending", past));
        assertFalse(SessionStateMachine.canMarkCompleted("Completed", past));
    }

    @Test
    void rejectsNonHttpsMeetingUrls() {
        assertTrue(SessionStateMachine.isSafeMeetingUrl("https://zoom.us/j/123456789"));
        assertFalse(SessionStateMachine.isSafeMeetingUrl("http://zoom.us/j/123"));
        assertFalse(SessionStateMachine.isSafeMeetingUrl("javascript:alert(1)"));
        assertFalse(SessionStateMachine.isSafeMeetingUrl("not a url"));
    }
}
