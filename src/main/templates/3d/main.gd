extends Node3D

const RUN_CLOCK := preload("res://hub-run-clock.gd")

const SPAWN := Vector3(0, .7, 1)
const MINT := Color("#8ce5bf")
const GOLD := Color("#ffdc82")
const PAPER := Color("#e4e4ff")
const PALETTES := {
	"night": {
		"sky": Color("#171932"), "ambient": Color("#cec9ed"), "light": Color("#f3e6ff"),
		"horizon": Color("#d9caff"), "ground": Color("#1c2039"), "detail": Color("#373858"),
		"stone": Color("#43536e"), "trim": Color("#6ecaba"),
	},
	"forest": {
		"sky": Color("#214d4c"), "ambient": Color("#b9dac1"), "light": Color("#ffe0a3"),
		"horizon": Color("#ffd8a3"), "ground": Color("#263f36"), "detail": Color("#385b47"),
		"stone": Color("#405c4b"), "trim": Color("#b2dd83"),
	},
	"space": {
		"sky": Color("#140d2d"), "ambient": Color("#cbb2f1"), "light": Color("#e9cbff"),
		"horizon": Color("#a170e6"), "ground": Color("#211832"), "detail": Color("#593f78"),
		"stone": Color("#58406c"), "trim": Color("#ddaaff"),
	},
}
const SPEEDS := {"steady": 6.2, "standard": 7.3, "swift": 8.4}

var title := "Moonlit Star Trail"
var star_total := 3
var difficulty := "normal"
var theme := "night"
var mobility := "standard"
var palette: Dictionary = PALETTES["night"]
var move_speed := 7.3
var jump_speed := 9.5
var goal := Vector3.ZERO
var checkpoint := SPAWN
var won := false
var collected := 0
var jump_held := false
var restart_held := false
var player: CharacterBody3D
var camera: Camera3D
var counter: Label
var run_clock := RUN_CLOCK.new()
var gate_parts: Array[MeshInstance3D] = []
var stars: Array[MeshInstance3D] = []
var gate_closed: StandardMaterial3D
var gate_open: StandardMaterial3D


func _ready() -> void:
	_load_config()
	palette = PALETTES[theme]
	move_speed = SPEEDS[mobility]
	if mobility == "swift":
		jump_speed = 10.4
	_bind(&"move_left", [KEY_A, KEY_LEFT])
	_bind(&"move_right", [KEY_D, KEY_RIGHT])
	_bind(&"move_forward", [KEY_W, KEY_UP])
	_bind(&"move_back", [KEY_S, KEY_DOWN])
	_bind(&"jump", [KEY_SPACE])
	_bind(&"restart", [KEY_R])
	_bind(&"exit_game", [KEY_ESCAPE])
	_build_sky()
	_build_level()
	_build_hud()
	_restart()
	if "--hub-self-test" in OS.get_cmdline_user_args():
		_self_test.call_deferred()


func _load_config() -> void:
	if not FileAccess.file_exists("res://game-config.json"):
		return
	var config: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://game-config.json"))
	if not config is Dictionary:
		return
	var requested_title: Variant = config.get("title")
	if requested_title is String and not requested_title.strip_edges().is_empty():
		title = requested_title.strip_edges().replace("\n", " ").replace("\r", " ").left(64)
	var requested_stars: Variant = config.get("stars")
	if (requested_stars is int or requested_stars is float) and requested_stars >= 1 and requested_stars <= 8 and requested_stars == int(requested_stars):
		star_total = int(requested_stars)
	var requested_difficulty: Variant = config.get("difficulty")
	if requested_difficulty in ["easy", "normal", "hard"]:
		difficulty = requested_difficulty
	var requested_theme: Variant = config.get("theme")
	if PALETTES.has(requested_theme):
		theme = requested_theme
	var requested_mobility: Variant = config.get("mobility")
	if SPEEDS.has(requested_mobility):
		mobility = requested_mobility


func _bind(action: StringName, keys: Array) -> void:
	InputMap.add_action(action)
	for key in keys:
		var event := InputEventKey.new()
		event.physical_keycode = key
		InputMap.action_add_event(action, event)


func _material(color: Color, glow := 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = .85
	if glow > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = glow
	return material


func _box(parent: Node3D, at: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	instance.mesh = mesh
	instance.material_override = material
	instance.position = at
	parent.add_child(instance)
	return instance


func _build_sky() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = palette["sky"]
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = palette["ambient"]
	environment.ambient_light_energy = .67
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var sun := DirectionalLight3D.new()
	sun.light_color = palette["light"]
	sun.light_energy = 1.12
	sun.rotation_degrees = Vector3(-47, -28, 0)
	sun.shadow_enabled = true
	add_child(sun)

	var moon := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 5.4 if theme == "space" else 3.2
	sphere.height = sphere.radius * 2.0
	moon.mesh = sphere
	moon.material_override = _material(palette["horizon"], 1.2)
	moon.position = Vector3(24, 13 if theme == "space" else 16, -100)
	add_child(moon)

	if theme == "space":
		var ring := MeshInstance3D.new()
		var orbit := TorusMesh.new()
		orbit.inner_radius = 7.0
		orbit.outer_radius = 7.75
		orbit.rings = 48
		orbit.ring_segments = 8
		ring.mesh = orbit
		ring.material_override = _material(Color("#f1beff"), .7)
		ring.rotation_degrees = Vector3(26, 0, -22)
		moon.add_child(ring)
	if theme != "forest":
		var star_material := _material(Color("#9588cb"), .6)
		for i in range(24):
			var x := fposmod(i * 27.0 + 12.0, 115.0) - 54.0
			var y := fposmod(i * 43.0 + 4.0, 30.0) + 3.0
			_box(self, Vector3(x, y, -114), Vector3(.12, .12, .12), star_material)


func _build_forest() -> void:
	var crowns := CylinderMesh.new()
	crowns.top_radius = 0.0
	crowns.bottom_radius = 1.8
	crowns.height = 4.4
	crowns.radial_segments = 7
	crowns.rings = 0
	var leaves := _material(Color("#386851"))
	var bark := _material(Color("#6a5141"))
	for i in range(20):
		var side := -1.0 if i % 2 == 0 else 1.0
		var x := side * (7.6 + fposmod(i * 7.7, 11.0))
		var z := 1.0 - i * 3.5
		_box(self, Vector3(x, -3.65, z), Vector3(.51, 4.4, .53), bark)
		var crown := MeshInstance3D.new()
		crown.mesh = crowns
		crown.material_override = leaves
		crown.position = Vector3(x, -.2, z)
		crown.scale = Vector3.ONE * (.9 + fposmod(i * .73, .60))
		add_child(crown)


func _build_level() -> void:
	var stride := 5.65
	var ledge_width := 3.9
	if difficulty == "easy":
		stride = 5.1
		ledge_width = 4.8
	elif difficulty == "hard":
		stride = 6.35
		ledge_width = 3.4
	var end_z := -(star_total + 1) * stride

	var ground := _material(palette["ground"], .15)
	_box(self, Vector3(0, -6.0, -28), Vector3(73, .25, 92), ground)
	if theme == "forest":
		_build_forest()
	else:
		var line := _material(palette["detail"], .23)
		for i in range(-12, 13):
			_box(self, Vector3(i * 2.75, -5.86, -28), Vector3(.025, .02, 92), line)
		for i in range(34):
			_box(self, Vector3(0, -5.86, 14 - i * 2.6), Vector3(73, .02, .025), line)

	var stone := _material(palette["stone"])
	var trim := _material(palette["trim"], .5)
	var gold := _material(GOLD, 1.1)
	_add_platform(Vector3.ZERO, 5.1, 5.0, stone, trim)
	for i in range(star_total):
		var x := (1.05 if i % 2 == 0 else -1.05)
		if difficulty == "hard":
			x *= 1.43
		var center := Vector3(x, float(i % 3) * .23, -(i + 1) * stride)
		_add_platform(center, ledge_width, 4.35, stone, trim)
		var star := _box(self, center + Vector3(0, .91, 0), Vector3(.43, .43, .43), gold)
		star.rotation_degrees = Vector3(27, 36, 42)
		stars.append(star)
	_add_platform(Vector3(0, 0, end_z), 5.1, 5.0, stone, trim)
	goal = Vector3(0, .62, end_z)
	gate_closed = _material(Color("#b9a4ed"), .65)
	gate_open = _material(MINT, 1.0)
	gate_parts.append(_box(self, goal + Vector3(-1.04, .47, -.2), Vector3(.22, 2.1, .30), gate_closed))
	gate_parts.append(_box(self, goal + Vector3(1.04, .47, -.2), Vector3(.22, 2.1, .30), gate_closed))
	gate_parts.append(_box(self, goal + Vector3(0, 1.59, -.2), Vector3(2.30, .24, .30), gate_closed))

	player = CharacterBody3D.new()
	player.set_collision_layer_value(1, false)
	player.set_collision_mask_value(1, true)
	var collider := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(.70, 1.06, .65)
	collider.shape = box
	player.add_child(collider)
	add_child(player)
	var boot := _material(Color("#57a79d"))
	var suit := _material(MINT)
	var helmet := _material(Color("#cafbe3"))
	var visor := _material(Color("#273450"))
	var eye := _material(PAPER, .7)
	_box(player, Vector3(-.18, -.41, 0), Vector3(.21, .24, .32), boot)
	_box(player, Vector3(.18, -.41, 0), Vector3(.21, .24, .32), boot)
	_box(player, Vector3(0, -.14, 0), Vector3(.65, .42, .43), suit)
	_box(player, Vector3(0, .26, 0), Vector3(.77, .40, .54), helmet)
	_box(player, Vector3(0, .28, -.28), Vector3(.55, .15, .017), visor)
	_box(player, Vector3(-.13, .28, -.295), Vector3(.07, .08, .013), eye)
	_box(player, Vector3(.13, .28, -.295), Vector3(.07, .08, .013), eye)
	_box(player, Vector3(0, .26, .29), Vector3(.35, .19, .055), visor)
	_box(player, Vector3(0, .26, .325), Vector3(.11, .09, .020), eye)

	camera = Camera3D.new()
	camera.current = true
	camera.fov = 58.0
	add_child(camera)


func _add_platform(top: Vector3, width: float, depth: float, material: Material, trim: Material) -> void:
	var body := StaticBody3D.new()
	body.position = top + Vector3(0, -.3, 0)
	var collider := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(width, .6, depth)
	collider.shape = box
	body.add_child(collider)
	add_child(body)
	_box(body, Vector3.ZERO, box.size, material)
	for x in [-1.0, 1.0]:
		_box(body, Vector3(x * (width / 2.0 - .08), .305, 0), Vector3(.13, .014, depth - .15), trim)
	for z in [-1.0, 1.0]:
		_box(body, Vector3(0, .305, z * (depth / 2.0 - .08)), Vector3(width - .15, .014, .13), trim)


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var backdrop := Panel.new()
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	backdrop.position = Vector2(22, 20)
	backdrop.size = Vector2(526, 91)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#13152eef")
	style.border_color = Color("#54517e")
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	backdrop.add_theme_stylebox_override("panel", style)
	layer.add_child(backdrop)

	var font := _game_font()
	run_clock.build_hud(layer, font, style)
	var title_label := _label(layer, Vector2(38, 30), title, 23, PAPER, font)
	title_label.size.x = 494
	title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	counter = _label(layer, Vector2(38, 65), "", 17, MINT, font)
	var help := _label(layer, Vector2(23, 490), "W / A / S / D or arrows · move    Space · jump    R · restart    Esc · close", 18, PAPER, font)
	help.add_theme_color_override("font_shadow_color", Color("#101025"))
	help.add_theme_constant_override("shadow_offset_y", 2)


func _game_font() -> Font:
	if FileAccess.file_exists("res://hub-ui-font.bin"):
		var font := FontFile.new()
		font.data = FileAccess.get_file_as_bytes("res://hub-ui-font.bin")
		return font
	return ThemeDB.fallback_font


func _label(layer: CanvasLayer, at: Vector2, value: String, font_size: int, color: Color, font: Font) -> Label:
	var label := Label.new()
	label.position = at
	label.text = value
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	layer.add_child(label)
	return label


func _restart() -> void:
	won = false
	collected = 0
	run_clock.reset()
	checkpoint = SPAWN
	for star in stars:
		star.show()
	_reset_player()
	_update_status()


func _reset_player() -> void:
	player.position = checkpoint
	player.velocity = Vector3.ZERO
	_move_camera()


func _physics_process(delta: float) -> void:
	if Input.is_action_just_pressed(&"exit_game"):
		get_tree().quit()
		return
	var restarting := Input.is_action_pressed(&"restart")
	if restarting and not restart_held:
		_restart()
	restart_held = restarting
	if won:
		return

	var axis := Input.get_vector(&"move_left", &"move_right", &"move_forward", &"move_back")
	var jumping := Input.is_action_pressed(&"jump")
	var launch_jump := jumping and not jump_held and player.is_on_floor()
	run_clock.tick(axis != Vector2.ZERO or launch_jump)
	player.velocity.x = axis.x * move_speed
	player.velocity.z = axis.y * move_speed
	player.velocity.y -= 21.8 * delta
	if launch_jump:
		player.velocity.y = jump_speed
	jump_held = jumping
	player.move_and_slide()
	if player.position.y < -5.5:
		_reset_player()
	_check_progress()
	_move_camera()
	for star in stars:
		if star.visible:
			star.rotate_y(delta * 1.25)


func _check_progress() -> void:
	for star in stars:
		if star.visible and player.position.distance_squared_to(star.position) <= .91 * .91:
			star.hide()
			collected += 1
			checkpoint = star.position - Vector3(0, .28, 0)
			_update_status()
	if collected == star_total and player.position.distance_squared_to(goal) <= 1.20 * 1.20:
		won = true
		run_clock.finish()
		player.velocity = Vector3.ZERO
		_update_status()


func _update_status() -> void:
	for part in gate_parts:
		part.material_override = gate_open if collected == star_total else gate_closed
	if won:
		counter.text = "All stars collected. R to play again."
	elif collected == star_total:
		counter.text = "%d / %d stars   •   Reach the green gate." % [collected, star_total]
	else:
		counter.text = "%d / %d stars   •   Jump across the trail to collect the stars." % [collected, star_total]


func _move_camera() -> void:
	var target := Vector3(player.position.x * .65, maxf(.6, player.position.y), player.position.z)
	camera.position = target + Vector3(0, 5.3, 9.9)
	camera.look_at(target + Vector3(0, -.15, -4.3))


func _self_test() -> void:
	for i in range(12):
		await get_tree().physics_frame
	if run_clock.elapsed_msec != 0 or run_clock.best_msec != -1:
		_fail_test("Run clock started before input")
		return
	if not player.is_on_floor() or stars.size() != star_total:
		_fail_test("3D scene, config or collision did not initialize")
		return

	var before := player.position.x
	Input.action_press(&"move_right")
	for i in range(12):
		await get_tree().physics_frame
	Input.action_release(&"move_right")
	if run_clock.elapsed_msec <= 0:
		_fail_test("Movement did not start the run clock")
		return
	if absf(player.position.x - before - move_speed * .20) > move_speed * .04:
		_fail_test("3D horizontal movement did not respond")
		return

	var depth_before := player.position.z
	Input.action_press(&"move_forward")
	for i in range(12):
		await get_tree().physics_frame
	Input.action_release(&"move_forward")
	if absf(depth_before - player.position.z - move_speed * .20) > move_speed * .04:
		_fail_test("3D depth movement did not respond")
		return

	var ground_y := player.position.y
	Input.action_press(&"jump")
	for i in range(12):
		await get_tree().physics_frame
	Input.action_release(&"jump")
	if player.position.y <= ground_y + .75:
		_fail_test("3D jump did not rise")
		return

	# Traverse the first gap with normal input, including on the slowest preset.
	var first_star := stars[0].position
	player.position = Vector3(first_star.x, SPAWN.y, -1.8)
	player.velocity = Vector3.ZERO
	for i in range(12):
		await get_tree().physics_frame
	Input.action_press(&"jump")
	Input.action_press(&"move_forward")
	for i in range(60):
		await get_tree().physics_frame
		if player.position.z <= first_star.z:
			break
	Input.action_release(&"jump")
	Input.action_release(&"move_forward")
	for i in range(45):
		await get_tree().physics_frame
		if player.is_on_floor():
			break
	if stars[0].visible or not player.is_on_floor():
		_fail_test("3D first gap could not be crossed and collected with this movement preset")
		return
	_restart()

	player.position = goal
	Input.action_press(&"move_right")
	for i in range(5):
		await get_tree().physics_frame
	Input.action_release(&"move_right")
	_check_progress()
	if won:
		_fail_test("3D gate opened before collection")
		return
	for star in stars:
		player.position = star.position
		_check_progress()
	player.position = goal
	_check_progress()
	if not won or collected != star_total:
		_fail_test("3D stars or goal did not complete")
		return
	var clear_msec := run_clock.elapsed_msec
	for i in range(7):
		await get_tree().physics_frame
	if clear_msec <= 0 or run_clock.elapsed_msec != clear_msec or run_clock.best_msec != clear_msec:
		_fail_test("Clear time did not freeze and become the session best")
		return
	Input.action_press(&"restart")
	for i in range(3):
		await get_tree().physics_frame
	Input.action_release(&"restart")
	if run_clock.elapsed_msec != 0 or run_clock.best_msec != clear_msec:
		_fail_test("Restart failed to reset the time and preserve the session best")
		return
	if won or collected != 0 or Vector2(player.position.x, player.position.z).distance_to(Vector2(SPAWN.x, SPAWN.z)) > .05:
		_fail_test("3D restart did not reset the game")
		return
	print("AI_HUB_GAME_SELF_TEST_OK 3D stars=%d difficulty=%s theme=%s mobility=%s" % [star_total, difficulty, theme, mobility])
	get_tree().quit()


func _fail_test(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
