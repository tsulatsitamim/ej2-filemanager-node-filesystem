/*jshint esversion: 8 */
var express = require('express');
var app = express();
var size = 0;
const path = require('path');
const bodyParser = require("body-parser");
const archiver = require('archiver');
const multer = require('multer');
const fs = require('fs');
const contentRootPath = process.argv[2] === '-d' ? process.argv[3] : undefined;
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(bodyParser.json());
/**
 * Reads text from the file asynchronously and returns a Promise.
 */
function GetFiles(req, res) {
    return new Promise((resolve, reject) => {
        fs.readdir(contentRootPath + req.body.path, function (err, files) {
            //handling error
            if (err) {
                console.log(err);
                reject(err);

            } else
                resolve(files);
        });
    });
}
/**
 * 
 * function to check for exising folder or file
 */
function checkForDuplicates(directory, name, isFile) {
    var filenames = fs.readdirSync(directory);
    if (filenames.indexOf(name) == -1) {
        return false;
    } else {
        for (var i = 0; i < filenames.length; i++) {
            if (filenames[i] === name) {
                if (!isFile && fs.lstatSync(directory + "/" + filenames[i]).isDirectory()) {
                    return true;
                } else if (isFile && !fs.lstatSync(directory + "/" + filenames[i]).isDirectory()) {
                    return true;
                } else {
                    return false;
                }
            }
        }
    }
}
/**
 * function to rename the folder
 */
function renameFolder(req, res) {
    var oldDirectoryPath = path.join(contentRootPath + req.body.path, req.body.name);
    var newDirectoryPath = path.join(contentRootPath + req.body.path, req.body.newName);
    if (checkForDuplicates(contentRootPath + req.body.path, req.body.newName, req.body.data[0].isFile)) {
        var errorMsg = new Error();
        errorMsg.message = "A file or folder with the name " + req.body.name + " already exists.";
        errorMsg.code = "400";
        response = { error: errorMsg };

        response = JSON.stringify(response);
        res.setHeader('Content-Type', 'application/json');
        res.json(response);
    } else {
        fs.renameSync(oldDirectoryPath, newDirectoryPath);
        (async () => {
            await FileManagerDirectoryContent(req, res, newDirectoryPath).then(data => {
                response = { files: data };
                response = JSON.stringify(response);
                res.setHeader('Content-Type', 'application/json');
                res.json(response);
            });
        })();
    }
}
/**
 * function to delete the folder
 */
function deleteFolder(req, res) {
    var deleteFolderRecursive = function (path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function (file, index) {
                var curPath = path + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    };
    var promiseList = [];
    for (var i = 0; i < req.body.names.length; i++) {
        var newDirectoryPath = path.join(contentRootPath + req.body.path, req.body.names[i]);

        promiseList.push(FileManagerDirectoryContent(req, res, newDirectoryPath));
    }
    Promise.all(promiseList).then(data => {
        data.forEach(function (files) {
            if (fs.lstatSync(path.join(contentRootPath + req.body.path, files.name)).isFile()) {
                fs.unlinkSync(path.join(contentRootPath + req.body.path, files.name));

            } else {
                deleteFolderRecursive(path.join(contentRootPath + req.body.path, files.name));
            }
        });
        response = { files: data };
        response = JSON.stringify(response);
        res.setHeader('Content-Type', 'application/json');
        res.json(response);
    });
}
/**
 * function to create the folder
 */
function createFolder(req, res, filepath) {
    var newDirectoryPath = path.join(contentRootPath + req.body.path, req.body.name);
    if (fs.existsSync(newDirectoryPath)) {
        var errorMsg = new Error();
        errorMsg.message = "A file or folder with the name " + req.body.name + " already exists.";
        errorMsg.code = "400";
        response = { error: errorMsg };

        response = JSON.stringify(response);
        res.setHeader('Content-Type', 'application/json');
        res.json(response);
    } else {
        fs.mkdirSync(newDirectoryPath);
        (async () => {
            await FileManagerDirectoryContent(req, res, newDirectoryPath).then(data => {
                response = { files: data };
                response = JSON.stringify(response);
                res.setHeader('Content-Type', 'application/json');
                res.json(response);
            });
        })();
    }
}
/**
 * function to get the file details like path, name and size
 */
function fileDetails(req, res, filepath) {
    return new Promise((resolve, reject) => {
        var cwd = {};
        fs.stat(filepath, function (err, stats) {
            cwd.name = path.basename(filepath);
            cwd.size = getSize(stats.size);
            cwd.isFile = stats.isFile();
            cwd.modified = stats.ctime;
            cwd.created = stats.mtime;
            cwd.type = path.extname(filepath);
            cwd.location = filepath.substr(filepath.indexOf(req.body.path), filepath.length - 1);
            resolve(cwd);
        });
    });
}

/** 
 * function to get the folder size
 */
function getFolderSize(req, res, directory, sizeValue) {
    size = sizeValue;
    var filenames = fs.readdirSync(directory);
    for (var i = 0; i < filenames.length; i++) {
        if (fs.lstatSync(directory + "/" + filenames[i]).isDirectory()) {
            getFolderSize(req, res, directory + "/" + filenames[i], size);
        } else {
            const stats = fs.statSync(directory + "/" + filenames[i]);
            size = size + stats.size;
        }
    }
}

/**
 * function to get the size in kb, MB
 */
function getSize(size) {
    var hz;
    if (size < 1024) hz = size + ' B';
    else if (size < 1024 * 1024) hz = (size / 1024).toFixed(2) + ' KB';
    else if (size < 1024 * 1024 * 1024) hz = (size / 1024 / 1024).toFixed(2) + ' MB';
    else hz = (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    return hz;
}
function getFileDetails(req, res, filterPath) {
    var isNamesAvailable = req.body.names.length > 0 ? true : false;
    if (req.body.names.length == 0 && req.body.data != 0) {
        var nameValues = [];
        req.body.data.forEach(function (item) {
            nameValues.push(item.name);
        });
        req.body.names = nameValues;
    }
    if (req.body.names.length == 1) {
        fileDetails(req, res, filterPath + (isNamesAvailable ? req.body.names[0] : "")).then(data => {
            if (!data.isFile) {
                getFolderSize(req, res, filterPath + (isNamesAvailable ? req.body.names[0] : ""), 0);
                data.size = getSize(size);
                size = 0;
            }
            response = { details: data };
            response = JSON.stringify(response);
            res.setHeader('Content-Type', 'application/json');
            res.json(response);
        });
    } else {
        req.body.names.forEach(function (item) {
            if (fs.lstatSync(filterPath + item).isDirectory()) {
                getFolderSize(req, res, filterPath + item, size);
            } else {
                const stats = fs.statSync(filterPath + item);
                size = size + stats.size;
            }
        });
        fileDetails(req, res, filterPath + req.body.names[0]).then(data => {
            data.name = req.body.names.join(", ");
            data.multipleFiles = true;
            data.size = getSize(size);
            size = 0;
            response = { details: data };
            response.details.location = filterPath.substr(filterPath.indexOf(":") + 1, filterPath.length - 1);
            response = JSON.stringify(response);
            res.setHeader('Content-Type', 'application/json');
            res.json(response);
        });
    }
}

function copyFolder(source, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
    }
    files = fs.readdirSync(source);
    files.forEach(function (file) {
        var curSource = path.join(source, file);
        if (fs.lstatSync(curSource).isDirectory()) {
            copyFolder(curSource, path.join(dest, file)); source
        } else {
            fs.copyFileSync(path.join(source, file), path.join(dest, file), (err) => {
                if (err) throw err;
            });
        }
    });
}
/**
 * function copyfile and folder
 */
function CopyFiles(req, res, contentRootPath) {
    var fileList = [];
    req.body.data.forEach(function (item) {
        if (item.isFile) {
            fs.copyFileSync(path.join(contentRootPath + req.body.path + req.path + item.name), path.join(contentRootPath + req.body.targetPath + item.name), (err) => {
                if (err) throw err;
            });
        }
        else {
            var fromPath = contentRootPath + req.body.path + req.path + item.name;
            var toPath = contentRootPath + req.body.targetPath + item.name;
            copyFolder(fromPath, toPath)
        }
        var list = item;
        list.filterPath = req.body.targetPath;
        fileList.push(list);
    });
    response = { files: fileList };
    response = JSON.stringify(response);
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
}

function MoveFolder(source, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
    }
    files = fs.readdirSync(source);
    files.forEach(function (file) {
        var curSource = path.join(source, file);
        if (fs.lstatSync(curSource).isDirectory()) {
            MoveFolder(curSource, path.join(dest, file));
            fs.rmdirSync(curSource);
        } else {
            fs.copyFileSync(path.join(source, file), path.join(dest, file), (err) => {
                if (err) throw err;
            });
            fs.unlinkSync(path.join(source, file), function (err) {
                if (err) throw err;
            });
        }
    });
}
/**
 * function move files and folder
 */
function MoveFiles(req, res, contentRootPath) {
    var fileList = [];
    req.body.data.forEach(function (item) {
        if (item.isFile) {
            var source = fs.createReadStream(path.join(contentRootPath + req.body.path + req.path + item.name));
            var desti = fs.createWriteStream(path.join(contentRootPath + req.body.targetPath + item.name));
            source.pipe(desti);
            source.on('end', function () {
                fs.unlinkSync(path.join(contentRootPath + req.body.path + req.path + item.name), function (err) {
                    if (err) throw err;
                });
            });
        }
        else {
            var fromPath = contentRootPath + req.body.path + req.path + item.name;
            var toPath = contentRootPath + req.body.targetPath + item.name;
            MoveFolder(fromPath, toPath);
            fs.rmdirSync(fromPath);
        }
        var list = item;
        list.filterPath = req.body.targetPath;
        fileList.push(list);
    });
    response = { files: fileList };
    response = JSON.stringify(response);
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
}

function getRelativePath(rootDirectory, fullPath) {
    if (rootDirectory.substring(rootDirectory.length - 1) == "/") {
        if (fullPath.indexOf(rootDirectory) >= 0) {
            return fullPath.substring(rootDirectory.length - 1);
        }
    }
    else if (fullPath.indexOf(rootDirectory + "/") >= 0) {
        return "/" + fullPath.substring(rootDirectory.length + 1);
    }
}
/**
 * returns the current working directories
 */
function FileManagerDirectoryContent(req, res, filepath) {
    var contentRootPath;
    if(req.path == "/"){
        contentRootPath = filepath;
    }else{
        contentRootPath = filepath.substring(0, (filepath.indexOf(req.body.path)));
    }
     
    return new Promise((resolve, reject) => {
        var cwd = {};
        fs.stat(filepath, function (err, stats) {
            cwd.name = path.basename(filepath);
            cwd.size = getSize(stats.size);
            cwd.isFile = stats.isFile();
            cwd.dateModified = stats.ctime;
            cwd.dateCreated = stats.mtime;
            cwd.type = path.extname(filepath);
            cwd.filterPath = req.body.data.length > 0 ? getRelativePath(contentRootPath, contentRootPath + req.body.path.substring(0, req.body.path.indexOf(req.body.data[0].name))) : "";
            if (fs.lstatSync(filepath).isFile()) {
                cwd.hasChild = false;
                resolve(cwd);
            }
        });
        if (fs.lstatSync(filepath).isDirectory()) {
            fs.readdir(filepath, function (err, stats) {
                stats.forEach(stat => {
                    if(fs.lstatSync(filepath + stat).isDirectory()){
                        cwd.hasChild = true
                    }else{
                        cwd.hasChild = false;
                    }
                    if(cwd.hasChild) return;
                });
                resolve(cwd);
            });
        }
    });
}
//Multer to upload the files to the server
var fileName = [];
//MULTER CONFIG: to get file photos to temp server storage
const multerConfig = {
    //specify diskStorage (another option is memory)
    storage: multer.diskStorage({
        //specify destination
        destination: function (req, file, next) {
            next(null, './');
        },

        //specify the filename to be unique
        filename: function (req, file, next) {
            fileName.push(file.originalname);
            next(null, file.originalname);

        }
    }),

    // filter out and prevent non-image files.
    fileFilter: function (req, file, next) {
        next(null, true);
    }
};

/**
 * Gets the imageUrl from the client
 */
app.get('/GetImage', function (req, res) {
    var image = req.query.path;
    fs.readFile(contentRootPath + image, function (err, content) {
        if (err) {
            res.writeHead(400, { 'Content-type': 'text/html' });
            res.end("No such image");
        } else {
            //specify the content type in the response will be an image
            res.writeHead(200, { 'Content-type': 'image/jpg' });
            res.end(content);
        }
    });
});

/**
 * Handles the upload request
 */
app.post('/Upload', function (req, res) {
    res.writeHead( 403, "File Manager's upload functionality is restricted in the online demo. If you need to test upload functionality, please install Syncfusion Essential Studio on your machine and run the demo.");
    res.end( "File Manager's upload functionality is restricted in the online demo. If you need to test upload functionality, please install Syncfusion Essential Studio on your machine and run the demo.");
});

/**
 * Download a file or folder
 */
app.post('/Download', function (req, res) {
    var downloadObj = JSON.parse(req.body.downloadInput);
    if (downloadObj.names.length === 1 && downloadObj.data[0].isFile) {
        var file = contentRootPath + downloadObj.path + downloadObj.names[0];
        res.download(file);
    } else {
        var archive = archiver('zip', {
            gzip: true,
            zlib: { level: 9 } // Sets the compression level.
        });
        var output = fs.createWriteStream('./Files.zip');
        downloadObj.data.forEach(function (item) {
            archive.on('error', function (err) {
                throw err;
            });
            if (item.isFile) {
                archive.file(contentRootPath + downloadObj.path + item.name, { name: item.name });
            }
            else {
                archive.directory(contentRootPath + downloadObj.path + item.name + "/", item.name);
            }
        });
        archive.pipe(output);
        archive.finalize();
        output.on('close', function () {
            var stat = fs.statSync(output.path);
            res.writeHead(200, {
                'Content-disposition': 'attachment; filename=Files.zip; filename*=UTF-8',
                'Content-Type': 'APPLICATION/octet-stream',
                'Content-Length': stat.size
            });
            var filestream = fs.createReadStream(output.path);
            filestream.pipe(res);
        });

    }
});

/**
 * Handles the read request
 */
app.post('/', function (req, res) {
    req.setTimeout(0);
    // Action for getDetails
    if (req.body.action == "details") {
        getFileDetails(req, res, contentRootPath + req.body.path);

    }
    // Action for copying files
    if (req.body.action == "copy") {
        CopyFiles(req, res, contentRootPath);
    }
    // Action for movinh files
    if (req.body.action == "move") {
        MoveFiles(req, res, contentRootPath);
    }
    // Action to create a new folder
    if (req.body.action == "create") {
        createFolder(req, res, contentRootPath + req.body.path);

    }
    // Action to remove a file
    if (req.body.action == "delete") {
        deleteFolder(req, res, contentRootPath + req.body.path);

    }
    // Action to rename a file
    if (req.body.action === "rename") {
        renameFolder(req, res, contentRootPath + req.body.path);

    }

    function fromDir(startPath, filter, contentRootPath) {
        if (!fs.existsSync(startPath)) {
            return;
        }
        var files = fs.readdirSync(startPath);
        for (var i = 0; i < files.length; i++) {
            var filename = path.join(startPath, files[i]);
            var stat = fs.lstatSync(filename);
            if (stat.isDirectory()) {
                fromDir(filename, filter, contentRootPath); //recurse
            }
            else if (files[i].indexOf(filter) >= 0) {
                var cwd = {};
                var stats = fs.statSync(filename);
                cwd.name = path.basename(filename);
                cwd.size = stats.size;
                cwd.isFile = stats.isFile();
                cwd.dateModified = stats.mtime;
                cwd.dateCreated = stats.ctime;
                cwd.type = path.extname(filename);
                cwd.filterPath = filename.substr((contentRootPath.length), filename.length).replace(files[i], "");
                if (fs.lstatSync(filename).isFile()) {
                    cwd.hasChild = false;
                }
                if (fs.lstatSync(filename).isDirectory()) {
                    var statsRead = fs.readdirSync(filename);
                    cwd.hasChild = statsRead.length > 0;
                }
                fileList.push(cwd);

            }
        }
    }

    // Action to search a file
    if (req.body.action === 'search') {
        var fileList = [];

        fromDir(contentRootPath + req.body.path, req.body.searchString.replace(/\*/g, ""), contentRootPath);
        (async () => {
            const tes = await FileManagerDirectoryContent(req, res, contentRootPath + req.body.path);
            response = { cwd: tes, files: fileList };
            response = JSON.stringify(response);
            res.setHeader('Content-Type', 'application/json');
            res.json(response);
        })();
    }

    function ReadDirectories(file) {
        var cwd = {};
        var directoryList = [];
        function stats(file) {
            return new Promise((resolve, reject) => {
                fs.stat(file, (err, cwd) => {
                    if (err) {
                        return reject(err);
                    }
                    cwd.name = path.basename(contentRootPath + req.body.path + file);
                    cwd.size = (cwd.size);
                    cwd.isFile = cwd.isFile();
                    cwd.dateModified = cwd.ctime;
                    cwd.dateCreated = cwd.mtime;
                    cwd.filterPath = req.body.data.length > 0 ? getRelativePath(contentRootPath, contentRootPath + req.body.path, req) : "";
                    cwd.type = path.extname(contentRootPath + req.body.path + file);
                    if (fs.lstatSync(file).isDirectory()) {
                        fs.readdirSync(file).forEach(function (items) {
                            if (fs.statSync(path.join(file, items)).isDirectory()) {
                                directoryList.push(items[i]);
                            }
                            if (directoryList.length > 0) {
                                cwd.hasChild = true;
                            } else {
                                cwd.hasChild = false;
                                directoryList = [];
                            }
                        });
                    } else {
                        cwd.hasChild = false;
                        dir = [];
                    }
                    directoryList = [];
                    resolve(cwd);
                });
            });
        }
        var promiseList = [];
        for (var i = 0; i < file.length; i++) {
            promiseList.push(stats(path.join(contentRootPath + req.body.path, file[i])));
        }
        return Promise.all(promiseList);
    }

    // Action to read a file
    if (req.body.action == "read") {
        (async () => {
            const filesList = await GetFiles(req, res);
            const cwdFiles = await FileManagerDirectoryContent(req, res, contentRootPath + req.body.path);
            var response = {};
            ReadDirectories(filesList).then(data => {
                response = { cwd: cwdFiles, files: data };
                response = JSON.stringify(response);
                res.setHeader('Content-Type', 'application/json');
                res.json(response);
            });

        })();
    }

});
/**
 * Server serving port
 */
var runPort = process.env.PORT || 8090;
var server = app.listen(runPort, function () {
    server.setTimeout(10 * 60 * 1000);
    var host = server.address().address;
    var port = server.address().port;
    console.log("Example app listening at http://%s:%s", host, port);
});