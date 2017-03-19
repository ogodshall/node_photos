var http = require('http'),
	fs = require('fs'),
	url = require('url');

function load_album_list (callback) {
	// assumes that all subdirectories in the 'albums' folder 
	// are photo albums 
	fs.readdir("albums", function (err, files) {
		if (err) {
			callback(make_error("file_error", JSON.stringify(err)));
			return;
		}

		var only_dirs = [];

		(function iterator (index) {
			if (index == files.length) {
				callback(null, only_dirs);
				return;
			}

			fs.stat("albums/" + files[index], function (err, stats) {
				if (err) {
					callback(make_error("file_error", JSON.stringify(err)));
					return;
				}

				if (stats.isDirectory()) {
					var obj = { name: files[index] };
					only_dirs.push(obj);
				}
				iterator(index + 1)
			});
		})(0);
	});
}

function load_album (album_name, page, page_size, callback) {
	// again, assumes that all subdirectories in 'albums/' 
	// is a photo album
	fs.readdir("albums/" + album_name, function (err, files) {
		if (err) {
			if (err.code == "ENOENT") {
				callback(no_such_album());
			} else {
				callback(make_error("file_error", JSON.stringify(err)));
			}
			return;
		}

		var only_files = [];
		var path = "albums/" + album_name + "/";

		(function iterator(index) {
			if (index == files.length) {
				var ps;
				// slice fails if params are out of range
				ps = only_files.splice(page * page_size, page_size);
				var obj = { short_name: album_name,
							photos: ps };
				callback(null, obj);
				return;
			}

			fs.stat(path + files[index], function (err, stats) {
				if (err) {
					callback(make_error("file_error", JSON.stringify(err)));
					return;
				}

				if (stats.isFile()) {
					var obj = { filename : files[index],
								desc : files[index] };
					only_files.push(obj);
				}
				iterator(index + 1);
			});
		})(0);
	});
}

function do_rename(old_name, new_name, callback) {
	// renames the album folder
	console.log("Renaming folder: " + old_name);
	fs.rename("albums/" + old_name,
			  "albums/" + new_name,
			  callback);
	console.log("Folder has been renamed: " + new_name);
}

function handle_incoming_request (req, res) {
	req.parsed_url = url.parse(req.url, true);
	var core_url = req.parsed_url.pathname;

	console.log("INCOMING REQUEST: " + req.method + " " + req.url);
	if (core_url == '/albums.json') {
		handle_list_albums(req, res);
	} else if (core_url.substr(core_url.length - 12) == '/rename.json' && req.method.toLowerCase() == 'post') {
		handle_rename_album(req, res);
	} else if (core_url.substr(0, 7) == '/albums' && core_url.substr(core_url.length - 5) == '.json') {
		handle_get_album(req, res);
	} else {
		send_failure(res, 404, invalid_resource());
	}
}

function handle_list_albums(req, res) {
	// format of request is /albums.json
	load_album_list(function (err, albums) {
		if (err) {
			send_failure(res, 500, err);
			return;
		}

		send_success(res, { albums: albums });
	});
}

function handle_get_album(req, res) {
	// get the GET params
	var getp = req.parsed_url.query;
	var page_num = getp.page ? parseInt(getp.page) : 0;
	var page_size = getp.page_size ? parseInt(getp.page_size) : 1000;

	if (isNaN(parseInt(page_num))) page_num = 0;
	if (isNaN(parseInt(page_size))) page_size = 1000;

	// format of request is /albums/album_name.json
	var core_url = req.parsed_url.pathname;

	var album_name = core_url.substr(7, core_url.length - 12);
	load_album(album_name, page_num, page_size, function (err, album_contents) {
		if (err && err.error == "no_such_album") {
			send_failure(res, 404, err);
		} else if (err) {
			send_failure(res, 500, err);
		} else {
			send_success(res, { album_data : album_contents });
		}
	});
}

function handle_rename_album (req, res) {
	// gets the album name from the url
	var core_url = req.parsed_url.pathname;
	var parts = core_url.split('/');
	if (parts.length != 4) {
		send_failure(res, 404, invalid_resource());
		return;
	}

	var album_name = parts[2];

	// gets the POST data for the request
	// includes the JSON name for the new album
	var json_body = '';
	req.on('readable', function() {
		var d = req.read();
		if (d) {
			if (typeof d == 'string') {
				json_body += d;
			} else if (typeof d == 'object' && d instanceof Buffer) {
				json_body += d.toString('utf8');
			}
		}
	});

	// Validate the POST data and then attempt rename
	req.on('end', function() {
		// checks for json_body
		if (json_body) {
			try {
				var album_data = JSON.parse(json_body);
				if (!album_data.album_name) {
					send_failure(res, 404, missing_data('album_name'));
					return;
				}
			} catch (e) {
				// json_body exists, but is bad json
				console.log("BODY IS BAD");
				send_failure(res, 403, bad_json());
				return;
			}
			// perform the rename
			console.log("RENAMING ENGAGED");
			do_rename(album_name, album_data.album_name, function (err, results) {
				if (err && err.code == "ENOENT") {
					send_failure(res, 403, no_such_album());
					return;
				} else if (err) {
					send_failure(res, 500, file_error(err));
					return;
				}
				send_success(res, null);
			});
		} else { // didn't get json_body
			console.log("NO BODY");
			send_failure(res, 403, bad_json());
			res.end();
		}
	});
}

function make_error (err, msg) {
	var e = new Error(msg);
	e.code = err;
	return e;
}

function send_success (res, data) {
	res.writeHead(200, { "Content-Type" : "application/json" });
	var output = { error: null, data : data };
	res.end(JSON.stringify(output) + "\n");
}

function send_failure (res, server_code, err) {
	var code = (err.code) ? err.code : err.name;
	res.writeHead(server_code, { "Content-Type" : "application/json" });
	res.end(JSON.stringify({ error: code, message: err.message }) + "\n");
}

function invalid_resource() {
	return make_error("invalid resource", "the requested resource does not exist");
}

function no_such_album() {
	return make_error("no such album", "the specified album does not exist");
}

function bad_json() {
	return make_error("invalid json", "the provided data is not valid JSON");
}

function missing_data() {
	return make_error("missing data", "some data is missing!");
}

var s = http.createServer(handle_incoming_request);
s.listen(8080);