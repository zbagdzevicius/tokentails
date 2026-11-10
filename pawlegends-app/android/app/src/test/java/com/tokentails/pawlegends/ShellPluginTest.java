package com.tokentails.pawlegends;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** The thermal names the game's governor knows (pawlegends/src/render/perf/thermal.ts), from PowerManager's statuses. */
public class ShellPluginTest {

    @Test
    public void thermalStatusesMapToTheIosNames() {
        assertEquals("nominal", ShellPlugin.thermalName(0));
        assertEquals("fair", ShellPlugin.thermalName(1));
        assertEquals("serious", ShellPlugin.thermalName(2));
        for (int s = 3; s <= 6; s++) assertEquals("critical", ShellPlugin.thermalName(s));
    }

    @Test
    public void releaseBuildsReadStableUnlessBuiltForBeta() {
        String c = ShellPlugin.channel();
        if (BuildConfig.DEBUG) assertEquals("dev", c);
        else assertEquals(BuildConfig.PL_OTA_CHANNEL, c);
    }
}
