<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <h2
      class="text-xl font-bold mb-4 text-orange-600 cursor-pointer"
      @click="stravaLogin"
    >
      Strava Login
    </h2>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const REDIRECT_URI = "http://localhost:3000/api/auth/strava/callback"; // must match Strava app settings

const config = useRuntimeConfig();
const STRAVA_CLIENT_ID = config.public.STRAVA_CLIENT_ID;

const stravaLogin = () => {
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&approval_prompt=auto&scope=read,activity:read_all`;
  window.location.href = authUrl;
};

</script>
