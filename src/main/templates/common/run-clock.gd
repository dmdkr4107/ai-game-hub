extends RefCounted

var elapsed_msec := 0
var best_msec := -1
var _started_msec := -1
var _shown_tenths := -1
var _time_label: Label
var _best_label: Label


func build_hud(layer: CanvasLayer, font: Font, style: StyleBoxFlat) -> void:
	var backdrop := Panel.new()
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	backdrop.position = Vector2(756, 20)
	backdrop.size = Vector2(182, 79)
	backdrop.add_theme_stylebox_override("panel", style)
	layer.add_child(backdrop)
	_time_label = _label(layer, font, Vector2(771, 29), 20, Color("#e4e4ff"))
	_best_label = _label(layer, font, Vector2(771, 59), 17, Color("#8ce5bf"))
	_best_label.text = "Best   —"
	reset()


func tick(player_started: bool) -> void:
	if _started_msec == -1 and not player_started:
		return
	var now := Time.get_ticks_msec()
	if _started_msec == -1:
		_started_msec = now
	elapsed_msec = now - _started_msec
	_update_time()


func finish() -> void:
	if _started_msec == -1:
		return
	tick(false)
	_started_msec = -1
	if best_msec == -1 or elapsed_msec < best_msec:
		best_msec = elapsed_msec
		_best_label.text = "Best   " + _format_time(best_msec)


func reset() -> void:
	_started_msec = -1
	elapsed_msec = 0
	_update_time()


func _update_time() -> void:
	var tenths := floori(elapsed_msec / 100.0)
	if tenths != _shown_tenths:
		_shown_tenths = tenths
		_time_label.text = "Time   " + _format_time(elapsed_msec)


func _format_time(milliseconds: int) -> String:
	var minutes := floori(milliseconds / 60000.0)
	var seconds := floori(milliseconds / 1000.0) % 60
	var tenths := floori(milliseconds / 100.0) % 10
	return "%d:%02d.%d" % [minutes, seconds, tenths]


func _label(layer: CanvasLayer, font: Font, position: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.position = position
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	layer.add_child(label)
	return label
