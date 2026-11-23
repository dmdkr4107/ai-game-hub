extends Node2D

const RUN_CLOCK := preload("res://hub-run-clock.gd")

const GROUND := 438.0
const SPAWN := Vector2(86, 414)
const MINT := Color("#8ce5bf")
const GOLD := Color("#ffdc82")
const PAPER := Color("#e4e4ff")
const PALETTES := {
	"night": {
		"sky_top": Color("#17182f"), "sky_low": Color("#3b2b54"), "ridge": Color("#28233e"),
		"ledge": Color("#273047"), "ground": Color("#1c2638"), "trim": MINT, "base_trim": Color("#507f81"),
	},
	"forest": {
		"sky_top": Color("#164051"), "sky_low": Color("#50744f"), "ridge": Color("#244b43"),
		"ledge": Color("#29473b"), "ground": Color("#182c26"), "trim": Color("#b2dd83"), "base_trim": Color("#71ad6d"),
	},
	"space": {
		"sky_top": Color("#100e2c"), "sky_low": Color("#472c62"), "ridge": Color("#2b2044"),
		"ledge": Color("#322749"), "ground": Color("#211c36"), "trim": Color("#d9a5fa"), "base_trim": Color("#935db6"),
	},
}
const SPEEDS := {"steady": 228.0, "standard": 266.0, "swift": 306.0}

var title := "Moonlit Star Trail"
var star_total := 3
var difficulty := "normal"
var theme := "night"
var mobility := "standard"
var palette: Dictionary = PALETTES["night"]
var move_speed := 266.0
var jump_speed := 524.0
var world_width := 960.0
var goal := Vector2.ZERO
var won := false
var facing := 1.0
var jump_held := false
var restart_held := false
var collected := 0
var platforms: Array[Rect2] = []
var star_positions: Array[Vector2] = []
var picked: Array[bool] = []
var player: CharacterBody2D
var camera: Camera2D
var counter: Label
var run_clock := RUN_CLOCK.new()


func _ready() -> void:
	_load_config()
	palette = PALETTES[theme]
	move_speed = SPEEDS[mobility]
	if mobility == "swift":
		jump_speed = 575.0
	_bind(&"move_left", [KEY_A, KEY_LEFT])
	_bind(&"move_right", [KEY_D, KEY_RIGHT])
	_bind(&"jump", [KEY_SPACE, KEY_W, KEY_UP])
	_bind(&"restart", [KEY_R])
	_bind(&"exit_game", [KEY_ESCAPE])
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


func _build_level() -> void:
	var stride := 174.0
	var ledge_width := 122.0
	if difficulty == "easy":
		stride = 155.0
		ledge_width = 148.0
	elif difficulty == "hard":
		stride = 192.0
		ledge_width = 92.0
	world_width = maxf(960.0, 530.0 + star_total * stride)
	_add_platform(Rect2(0, GROUND, world_width, 104), false)
	for i in range(star_total):
		var lift := 46.0 + 14.0 * (i % 3)
		if difficulty == "hard":
			lift += 13.0
		var ledge := Rect2(294.0 + i * stride, GROUND - lift, ledge_width, 21)
		_add_platform(ledge, true)
		star_positions.append(ledge.position + Vector2(ledge_width / 2.0, -24))
	goal = Vector2(world_width - 112.0, GROUND - 25)

	player = CharacterBody2D.new()
	player.set_collision_layer_value(1, false)
	player.set_collision_mask_value(1, true)
	var collider := CollisionShape2D.new()
	var box := RectangleShape2D.new()
	box.size = Vector2(28, 40)
	collider.shape = box
	player.add_child(collider)
	add_child(player)

	camera = Camera2D.new()
	camera.enabled = true
	# Keep the vertical view steady while following the player horizontally.
	camera.position.y = 270
	add_child(camera)


func _add_platform(rect: Rect2, one_way: bool) -> void:
	platforms.append(rect)
	var body := StaticBody2D.new()
	body.position = rect.get_center()
	var collider := CollisionShape2D.new()
	var box := RectangleShape2D.new()
	box.size = rect.size
	collider.shape = box
	collider.one_way_collision = one_way
	body.add_child(collider)
	add_child(body)


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
	var help := _label(layer, Vector2(23, 490), "A / D or arrows · move    Space · jump    R · restart    Esc · close", 18, PAPER, font)
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
	facing = 1
	picked.resize(star_positions.size())
	picked.fill(false)
	_reset_player()
	_update_status()


func _reset_player() -> void:
	player.position = SPAWN
	player.velocity = Vector2.ZERO
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

	var axis := Input.get_axis(&"move_left", &"move_right")
	var jumping := Input.is_action_pressed(&"jump")
	var launch_jump := jumping and not jump_held and player.is_on_floor()
	run_clock.tick(axis != 0.0 or launch_jump)
	if axis != 0:
		facing = signf(axis)
	player.velocity.x = axis * move_speed
	player.velocity.y += 1190.0 * delta
	if launch_jump:
		player.velocity.y = -jump_speed
	jump_held = jumping
	player.move_and_slide()
	player.position.x = clampf(player.position.x, 16.0, world_width - 16.0)
	if player.position.y > 620:
		_reset_player()
	_check_progress()
	_move_camera()
	queue_redraw()


func _check_progress() -> void:
	for i in range(star_positions.size()):
		if not picked[i] and player.position.distance_squared_to(star_positions[i]) <= 31.0 * 31.0:
			picked[i] = true
			collected += 1
			_update_status()
	if collected == star_total and player.position.distance_squared_to(goal) <= 39.0 * 39.0:
		won = true
		run_clock.finish()
		player.velocity = Vector2.ZERO
		_update_status()
		queue_redraw()


func _update_status() -> void:
	if won:
		counter.text = "All stars collected. R to play again."
	elif collected == star_total:
		counter.text = "%d / %d stars   •   Reach the green gate." % [collected, star_total]
	else:
		counter.text = "%d / %d stars   •   Collect the stars to open the gate." % [collected, star_total]


func _move_camera() -> void:
	camera.position.x = clampf(player.position.x, 480.0, world_width - 480.0)


func _draw() -> void:
	if not is_instance_valid(player):
		return
	_draw_landscape()
	for i in range(platforms.size()):
		var rect := platforms[i]
		draw_rect(rect, palette["ledge"] if i != 0 else palette["ground"])
		draw_rect(Rect2(rect.position, Vector2(rect.size.x, 4)), palette["trim"] if i != 0 else palette["base_trim"])
		for tile in range(ceili(rect.size.x / 28.0)):
			var x := rect.position.x + tile * 28.0 + 6.0
			draw_line(Vector2(x, rect.position.y + 11), Vector2(x + 14, rect.position.y + 11), Color("#4b535f"), 1)
	for i in range(star_positions.size()):
		if not picked[i]:
			_draw_star(star_positions[i])
	_draw_gate()
	_draw_runner()


func _draw_landscape() -> void:
	var sky_top: Color = palette["sky_top"]
	var sky_low: Color = palette["sky_low"]
	for layer in range(8):
		draw_rect(Rect2(-480, layer * 55.0, world_width + 960, 55), sky_top.lerp(sky_low, layer / 7.0))
	var horizon := Vector2(camera.position.x + 197, 117)
	if theme == "space":
		draw_circle(horizon, 70, Color("#9b71e729"))
		draw_circle(horizon, 49, Color("#9365cf"))
		draw_set_transform(horizon, -.25, Vector2(1.0, .33))
		draw_arc(Vector2.ZERO, 68, 0, TAU, 48, Color("#edbfed"), 4.0, true)
		draw_set_transform(Vector2.ZERO)
	elif theme == "forest":
		draw_circle(horizon, 53, Color("#ffd28b35"))
		draw_circle(horizon, 35, Color("#f3bc83"))
	else:
		draw_circle(horizon, 37, Color("#6d57856e"))
		draw_circle(horizon, 26, Color("#d4c9f0"))
	var glow := Color("#e2eda7") if theme == "forest" else Color("#ada4d4")
	for i in range(58):
		var x := fposmod(i * 197.0 + 7.0, world_width)
		var y := fposmod(i * 113.0 + 51.0, 249.0) + 27.0
		if theme == "forest":
			y = y * .65 + 195.0
		draw_circle(Vector2(x, y), 1.2 if i % 4 else 1.8, glow)
	for i in range(ceili(world_width / 120.0) + 2):
		var x := i * 120.0 - 95.0
		var rise := 274.0 + fposmod(i * 73.0, 81.0)
		draw_colored_polygon(PackedVector2Array([Vector2(x - 122, GROUND), Vector2(x, rise), Vector2(x + 136, GROUND)]), palette["ridge"])
		if theme == "forest":
			_draw_pine(x + 41.0, 98.0 + fposmod(i * 31.0, 54.0))


func _draw_pine(x: float, height: float) -> void:
	draw_rect(Rect2(x - 4.0, GROUND - 42.0, 8, 42), Color("#263a33"))
	for tier in range(3):
		var y := GROUND - height + tier * height * .21
		var width := (tier + 2) * height * .087
		draw_colored_polygon(PackedVector2Array([
			Vector2(x, y), Vector2(x - width, y + height * .43), Vector2(x + width, y + height * .43),
		]), Color("#193f38"))


func _draw_star(at: Vector2) -> void:
	var points := PackedVector2Array()
	for i in range(10):
		var angle := -PI / 2.0 + i * TAU / 10.0
		var radius := 13.0 if i % 2 == 0 else 6.0
		points.append(at + Vector2.from_angle(angle) * radius)
	draw_circle(at, 18, Color("#ffdc8230"))
	draw_colored_polygon(points, GOLD)


func _draw_gate() -> void:
	var open := collected == star_total
	var accent := MINT if open else Color("#b4a0d7")
	var frame := Rect2(goal.x - 24, GROUND - 62, 48, 62)
	draw_rect(frame, Color("#284647") if open else Color("#342b46"))
	draw_rect(frame, accent, false, 3)
	draw_line(Vector2(goal.x - 34, GROUND), Vector2(goal.x + 34, GROUND), accent, 4)
	if not open:
		for x in [-12, 0, 12]:
			draw_line(goal + Vector2(x, -31), goal + Vector2(x, 22), accent, 2)
	else:
		draw_circle(goal + Vector2(10, 0), 4, GOLD)


func _draw_runner() -> void:
	var at := player.position
	draw_rect(Rect2(at + Vector2(-12, 12), Vector2(9, 8)), Color("#589a92"))
	draw_rect(Rect2(at + Vector2(3, 12), Vector2(9, 8)), Color("#589a92"))
	draw_rect(Rect2(at + Vector2(-14, -3), Vector2(28, 18)), MINT)
	draw_rect(Rect2(at + Vector2(-17, -20), Vector2(34, 17)), Color("#c4f8e0"))
	draw_rect(Rect2(at + Vector2(-8 + facing * 6, -15), Vector2(15, 7)), Color("#273450"))
	draw_rect(Rect2(at + Vector2(-2 + facing * 6, -13), Vector2(3, 3)), PAPER)


func _self_test() -> void:
	for i in range(12):
		await get_tree().physics_frame
	if run_clock.elapsed_msec != 0 or run_clock.best_msec != -1:
		_fail_test("Run clock started before input")
		return
	if not player.is_on_floor() or star_positions.size() != star_total:
		_fail_test("2D scene, config or collision did not initialize")
		return

	var before := player.position.x
	Input.action_press(&"move_right")
	for i in range(18):
		await get_tree().physics_frame
	Input.action_release(&"move_right")
	if run_clock.elapsed_msec <= 0:
		_fail_test("Movement did not start the run clock")
		return
	if absf(player.position.x - before - move_speed * .30) > move_speed * .04:
		_fail_test("2D movement did not respond")
		return

	var ground_y := player.position.y
	Input.action_press(&"jump")
	for i in range(12):
		await get_tree().physics_frame
	Input.action_release(&"jump")
	if player.position.y >= ground_y - 30.0:
		_fail_test("2D jump did not rise")
		return

	player.position = goal
	_check_progress()
	if won:
		_fail_test("2D gate opened before collection")
		return
	for point in star_positions:
		player.position = point
		_check_progress()
	player.position = goal
	_check_progress()
	if not won or collected != star_total:
		_fail_test("2D stars or goal did not complete")
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
	if won or collected != 0 or absf(player.position.x - SPAWN.x) > 2.0:
		_fail_test("2D restart did not reset the game")
		return
	print("AI_HUB_GAME_SELF_TEST_OK 2D stars=%d difficulty=%s theme=%s mobility=%s" % [star_total, difficulty, theme, mobility])
	get_tree().quit()


func _fail_test(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
