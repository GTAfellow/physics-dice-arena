<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ChevronDown, ChevronUp, Dices, RotateCcw, Trash2 } from "@lucide/vue";
import { ARENA_OPTIONS, DICE_OPTIONS } from "../i18n";
import { MOBILE_LAYOUT_QUERY } from "../ui/device.js";

const props = defineProps({
	copy: { type: Object, required: true },
	diceType: { type: String, required: true },
	diceCount: { type: String, required: true },
	arenaMode: { type: String, required: true },
	diceTranslucent: { type: Boolean, required: true },
	countMin: { type: Number, required: true },
	countMax: { type: Number, required: true },
	countInvalid: { type: Boolean, required: true },
	isD100: { type: Boolean, required: true },
	result: { type: String, required: true },
	resultInvalid: { type: Boolean, default: false },
});

const emit = defineEmits([
	"update:diceType",
	"update:diceCount",
	"update:arenaMode",
	"update:diceTranslucent",
	"roll",
	"clear",
	"toggleLang",
	"resetView",
]);

const typeMenuOpen = ref(false);
const typeMenuPosition = ref({});
const mobileQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
const collapsed = ref(mobileQuery.matches && window.innerHeight < 500);
const touchQuery = window.matchMedia("(pointer: coarse)");
const isMobile = ref(mobileQuery.matches);
const touchInput = ref(touchQuery.matches);
const hint = computed(() => touchInput.value ? props.copy.hintTouch : props.copy.hintMouse);
const syncInputMode = () => {
	isMobile.value = mobileQuery.matches;
	touchInput.value = touchQuery.matches;
	typeMenuOpen.value = false;
};

function toggleTypeMenu(event) {
	const bounds = event.currentTarget.getBoundingClientRect();
	typeMenuPosition.value = {
		left: `${bounds.left}px`,
		bottom: `${window.innerHeight - bounds.top + 6}px`,
		width: `${bounds.width}px`,
		maxHeight: `${Math.max(80, Math.min(280, bounds.top - 12))}px`,
	};
	typeMenuOpen.value = !typeMenuOpen.value;
}

function collapse() {
	typeMenuOpen.value = false;
	collapsed.value = true;
}

function closeTypeMenu(event) {
	if (!event.target.closest(".type-select-wrap, .mobile-type-menu")) typeMenuOpen.value = false;
}

function onKeyDown(event) {
	if (event.key === "Escape" && typeMenuOpen.value) {
		typeMenuOpen.value = false;
		document.querySelector(".mobile-type-btn")?.focus();
	}
}

onMounted(() => {
	mobileQuery.addEventListener("change", syncInputMode);
	touchQuery.addEventListener("change", syncInputMode);
	document.addEventListener("pointerdown", closeTypeMenu);
	document.addEventListener("keydown", onKeyDown);
	window.addEventListener("resize", syncInputMode);
});
onUnmounted(() => {
	mobileQuery.removeEventListener("change", syncInputMode);
	touchQuery.removeEventListener("change", syncInputMode);
	document.removeEventListener("pointerdown", closeTypeMenu);
	document.removeEventListener("keydown", onKeyDown);
	window.removeEventListener("resize", syncInputMode);
});

const translatedOptions = computed(() => (
	DICE_OPTIONS.map((value) => ({ value, label: props.copy.options[value] || value }))
));

const translatedArenaOptions = computed(() => (
	ARENA_OPTIONS.map((value) => ({ value, label: props.copy.arenaOptions[value] || value }))
));

const mobileTypeLabel = computed(() => props.copy.options[props.diceType] || props.diceType);

function selectType(value) {
	emit("update:diceType", value);
	typeMenuOpen.value = false;
}
</script>

<template>
	<div class="controls-dock" :class="{ collapsed: collapsed && isMobile }">
	<Transition name="sheet">
	<section v-show="!collapsed || !isMobile" id="dice-controls" class="panel">
		<div class="panel-head">
			<h1 class="title">{{ copy.title }}</h1>
			<div class="panel-tools">
			<button type="button" class="icon-btn" :title="copy.resetView" :aria-label="copy.resetView" @click="emit('resetView')"><RotateCcw :size="18" /></button>
			<button type="button" class="lang-btn" @click="emit('toggleLang')">{{ copy.langSwitch }}</button>
			<button type="button" class="icon-btn collapse-btn" :title="copy.collapseControls" :aria-label="copy.collapseControls" aria-controls="dice-controls" aria-expanded="true" @click="collapse"><ChevronDown :size="22" /></button>
			</div>
		</div>
		<div class="grid" :class="{ percentile: isD100 }">
			<div>
				<label for="diceType">{{ copy.diceType }}</label>
				<div class="type-select-wrap">
					<select
						id="diceType"
						:value="diceType"
						@change="selectType($event.target.value)"
					>
						<option v-for="option in translatedOptions" :key="option.value" :value="option.value">
							{{ option.label }}
						</option>
					</select>
					<button
						type="button"
						class="mobile-type-btn"
						aria-haspopup="listbox"
						:aria-expanded="String(typeMenuOpen)"
						@click.stop="toggleTypeMenu"
					>
						{{ mobileTypeLabel }}
					</button>
					<Teleport to="body">
					<div class="mobile-type-menu" :class="{ hidden: !typeMenuOpen }" :style="typeMenuPosition" role="listbox">
						<button
							v-for="option in translatedOptions"
							:key="option.value"
							type="button"
							class="mobile-type-item"
							:class="{ active: option.value === diceType }"
							role="option"
							:aria-selected="String(option.value === diceType)"
							@click="selectType(option.value)"
						>
							{{ option.label }}
						</button>
					</div>
					</Teleport>
				</div>
			</div>
			<div :class="{ hidden: isD100 }">
				<label for="diceCount">{{ copy.diceCount }}</label>
				<input
					id="diceCount"
					:value="diceCount"
					type="number"
					:min="countMin"
					:max="countMax"
					:disabled="isD100"
					:aria-invalid="String(countInvalid)"
					@input="emit('update:diceCount', $event.target.value)"
				/>
				<div class="error" :class="{ hidden: !countInvalid }">{{ copy.countRangeError }}</div>
			</div>
		</div>
		<div class="field-row">
			<label for="arenaMode">{{ copy.arenaMode }}</label>
			<select
				id="arenaMode"
				:value="arenaMode"
				@change="emit('update:arenaMode', $event.target.value)"
			>
				<option v-for="option in translatedArenaOptions" :key="option.value" :value="option.value">
					{{ option.label }}
				</option>
			</select>
		</div>
		<label class="toggle-row" for="diceTranslucent">
			<span>{{ copy.diceTranslucent }}</span>
			<input
				id="diceTranslucent"
				class="toggle-input"
				type="checkbox"
				:checked="diceTranslucent"
				@change="emit('update:diceTranslucent', $event.target.checked)"
			/>
			<span class="toggle-track" aria-hidden="true">
				<span class="toggle-thumb"></span>
			</span>
		</label>
		<div class="actions">
			<button class="primary" @click="emit('roll')"><Dices :size="18" />{{ copy.roll }}</button>
			<button class="secondary" @click="emit('clear')"><Trash2 :size="18" />{{ copy.clear }}</button>
		</div>
		<output class="result" :class="{ invalid: resultInvalid }" aria-live="polite" aria-atomic="true">{{ result }}</output>
		<div class="hint">{{ hint }}</div>
	</section>
	</Transition>
	<div v-if="collapsed && isMobile" class="compact-controls">
		<button type="button" class="icon-btn expand-btn" :title="copy.expandControls" :aria-label="copy.expandControls" aria-controls="dice-controls" aria-expanded="false" @click="collapsed = false"><ChevronUp :size="24" /></button>
		<output class="compact-result" :class="{ invalid: resultInvalid }" aria-live="polite" aria-atomic="true">{{ result }}</output>
		<button type="button" class="primary quick-roll" @click="emit('roll')"><Dices :size="20" />{{ copy.roll }}</button>
	</div>
	</div>
</template>
