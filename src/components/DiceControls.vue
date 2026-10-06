<script setup>
import { computed, ref } from "vue";
import { ARENA_OPTIONS, DICE_OPTIONS } from "../i18n";

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
});

const emit = defineEmits([
	"update:diceType",
	"update:diceCount",
	"update:arenaMode",
	"update:diceTranslucent",
	"roll",
	"clear",
	"toggleLang",
]);

const typeMenuOpen = ref(false);

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
	<div class="panel">
		<div class="panel-head">
			<h1 class="title">{{ copy.title }}</h1>
			<button type="button" class="lang-btn" @click="emit('toggleLang')">{{ copy.langSwitch }}</button>
		</div>
		<div class="grid">
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
						@click.stop="typeMenuOpen = !typeMenuOpen"
					>
						{{ mobileTypeLabel }}
					</button>
					<div class="mobile-type-menu" :class="{ hidden: !typeMenuOpen }" role="listbox">
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
			<button class="primary" @click="emit('roll')">{{ copy.roll }}</button>
			<button class="secondary" @click="emit('clear')">{{ copy.clear }}</button>
		</div>
		<div class="result">{{ result }}</div>
		<div class="hint">{{ copy.hint }}</div>
	</div>
</template>
