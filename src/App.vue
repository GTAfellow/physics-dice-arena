<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import DiceControls from "./components/DiceControls.vue";
import { COUNT_MAX, COUNT_MIN, I18N } from "./i18n";
import { createDiceArena } from "./physics/createDiceArena";

const canvasRef = ref(null);
const arena = ref(null);
const currentLang = ref((navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en");
const diceType = ref("d6");
const diceCount = ref("1");
const arenaMode = ref("dish");
const countInvalid = ref(false);
const diceTranslucent = ref(true);
const resultMode = ref("ready");
const resultPayload = ref(null);
const lastNonD100Count = ref(1);

const copy = computed(() => I18N[currentLang.value]);
const isD100 = computed(() => diceType.value === "d100");

const result = computed(() => {
	if (resultPayload.value?.kind === "cocked") {
		return copy.value.cocked.replace("{indices}", resultPayload.value.indices.join(", "));
	}
	if (resultPayload.value?.kind === "percentile") {
		const { ones, tens, total } = resultPayload.value;
		return `${copy.value.percentile}: ${copy.value.tens}=${String(tens).padStart(2, "0")}, ${copy.value.ones}=${ones} | ${copy.value.total}: ${total}`;
	}

	if (resultPayload.value?.kind === "sum") {
		const { values, sum } = resultPayload.value;
		return `${copy.value.results}: [${values.join(", ")}] | ${copy.value.sum}: ${sum}`;
	}

	return copy.value[resultMode.value] || "";
});

function validateCount() {
	if (isD100.value) {
		countInvalid.value = false;
		return { valid: true, count: 2 };
	}

	const parsed = Number(diceCount.value);
	const valid = Number.isInteger(parsed) && parsed >= COUNT_MIN && parsed <= COUNT_MAX;
	countInvalid.value = !valid;

	if (valid) {
		lastNonD100Count.value = parsed;
	}

	return { valid, count: valid ? parsed : null };
}

function syncCountForType() {
	if (isD100.value) {
		diceCount.value = "2";
		countInvalid.value = false;
		return;
	}

	if (String(diceCount.value) === "2") {
		diceCount.value = String(lastNonD100Count.value || 1);
	}

	validateCount();
}

function rollDice() {
	const validation = validateCount();
	if (!validation.valid) {
		resultPayload.value = null;
		resultMode.value = "countRangeError";
		return;
	}

	const count = isD100.value ? 2 : validation.count;
	diceCount.value = String(count);
	resultPayload.value = null;
	resultMode.value = "rolling";
	arena.value?.setArenaMode(arenaMode.value);
	arena.value?.roll(diceType.value, count);
}

function clearArena() {
	arena.value?.clear();
	resultPayload.value = null;
	resultMode.value = "cleared";
}

function resetCamera() {
	arena.value?.resetView();
}

function toggleLang() {
	currentLang.value = currentLang.value === "en" ? "zh" : "en";
}

watch(diceType, syncCountForType);
watch(diceCount, validateCount);
watch(arenaMode, (mode) => {
	arena.value?.setArenaMode(mode);
	resultPayload.value = null;
	resultMode.value = "ready";
});
watch(diceTranslucent, (enabled) => {
	arena.value?.setDiceTranslucent(enabled);
});

onMounted(() => {
	arena.value = createDiceArena(canvasRef.value, {
		onRollFinish(payload) {
			resultPayload.value = payload;
			resultMode.value = "";
		},
	});
	if (import.meta.env.DEV) {
		window.__diceArena = arena.value;
	}
	arena.value.setDiceTranslucent(diceTranslucent.value);
	arena.value.setArenaMode(arenaMode.value);
	syncCountForType();
});
onUnmounted(() => {
	if (import.meta.env.DEV && window.__diceArena === arena.value) delete window.__diceArena;
	arena.value?.dispose();
});
</script>

<template>
	<div class="app-shell">
		<canvas ref="canvasRef" class="scene"></canvas>
		<DiceControls
			v-model:dice-type="diceType"
			v-model:dice-count="diceCount"
			v-model:arena-mode="arenaMode"
			v-model:dice-translucent="diceTranslucent"
			:copy="copy"
			:count-min="COUNT_MIN"
			:count-max="COUNT_MAX"
			:count-invalid="countInvalid"
			:is-d100="isD100"
			:result="result"
			:result-invalid="resultPayload?.kind === 'cocked'"
			@roll="rollDice"
			@clear="clearArena"
			@toggle-lang="toggleLang"
			@reset-view="resetCamera"
		/>
	</div>
</template>
