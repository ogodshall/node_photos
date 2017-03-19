# "Album Maanager" from the "node_photos" project
Taken from "Learning Node.js" by Marc Wandschneider

This is a module for managing photo albums based on a directory. It assumes, given a path, that there is an albums sub-folder, and that each sub-folder is a photo album. Files within the sub-folders are individual photos.

The album manager contains a single function, "albums", which returns an array of 'Album' objects for each album it contains.

The Album object has two properties and one method:
* 'name' - Name of the album
* 'path' - Path of the album
* 'photos()' - Returns all of the album's photos