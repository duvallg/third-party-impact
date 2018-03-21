const ndarray = require("ndarray");
const getPixels = require("get-pixels");
const savePixels = require("save-pixels");
const zeros = require("zeros");
const fs = require("fs");
const path = require("path");

var result;

const compareImages = function(testFrame,finalFramePixels,ms,outputPath,isFinal=false,threshold=0) {
    return new Promise((resolve,reject) => {
        let sameCount = 0;
        getPixels(testFrame, function(err, testPixels) {
            if (err) {
                return reject(err);
            } else {
                result = zeros([finalFramePixels.shape[0],finalFramePixels.shape[1],4]);
                for (let x=0; x<result.shape[0]; x++) {
                    for (let y=0; y<result.shape[1]; y++) {
                        diff = false;
                        diffcheck:
                        for (let i=0;i<3;i++) {
                            if (isFinal || Math.abs(testPixels.get(x,y,i)-finalFramePixels.get(x,y,i)) <= threshold) {
                                result.set(x,y,0,200);
                                result.set(x,y,1,200);
                                result.set(x,y,2,0);
                                result.set(x,y,3,255);
                                sameCount++;
                                break diffcheck;
                            }
                        }
                    }
                }
                saveArray(result,path.join(outputPath,`${ms}.png`));
                return resolve({ms:ms,sameCount:sameCount});
            }
        })
    })
}

const msFromFilename = function(filename) {
    let start = filename.indexOf("_")+1;
    let end = filename.indexOf(".")
    let result = parseInt(filename.slice(start,end))
    if (end - start < 6) {
        /* sometimes we get 1/10th seconds, sometimes 1/1000th */
        result *= 100;
    }
    return result;
}

const imageSort = function(a,b) {
    if (a==b) {
        return 0;
    } else if (msFromFilename(a)>msFromFilename(b)) {
        return 1;
    } else {
        return -1;
    }
}

const saveArray = function(result,filename) {
    let out = fs.createWriteStream(filename);
    let stream = savePixels(result, "png");
    stream.pipe(out);
    return out;
}

const getImageArrayFromDirectory = function(directory) {
    let frames = fs.readdirSync(directory);

    let imageArray = [];
    for (let i in frames) {
        let dot = frames[i].indexOf(".");
        if (dot > 0) {
            if (['jpg','png'].indexOf(frames[i].substring(dot+1))>-1) {
                imageArray.push(frames[i]);
            }
        }
    }
    imageArray.sort(imageSort);
    return imageArray;
}

module.exports = function generateHeatmapFrames(imagePath,outputPath) {
    return new Promise((resolve,reject)=>{
        outputPath = (outputPath == undefined ? '': outputPath);
        let frames = getImageArrayFromDirectory(imagePath);
        let finalFrame = path.join(imagePath,frames.slice(-1).pop());
        getPixels(finalFrame, function(err, finalFramePixels) {
            if (err) throw new Error(err);
            result = zeros([finalFramePixels.shape[0],finalFramePixels.shape[1],4]);
            let comparisons = [];
            frameJSON = []
            frameCompletions = []
            for (let i in frames) {
                let isFinal = (i==frames.length-1?true:false);
                var imageFn = path.join(imagePath,frames[i]);
                var ms = msFromFilename(frames[i]);
                frameJSON.push({time:ms,frame:path.join(outputPath.replace('public',''),`${ms}.png`)});
                comparisons.push(
                    compareImages(imageFn,finalFramePixels,ms,outputPath,isFinal)
                );
            }
            fs.createReadStream(finalFrame).pipe(fs.createWriteStream(path.join(outputPath,'final.jpg')));
            Promise.all(comparisons).then((frameCompletions)=>{
                let maxPixels = finalFramePixels.shape[0]*finalFramePixels.shape[1];
                for (var i in frameCompletions) {
                    frameCompletion = frameCompletions[i];
                    let perc = (frameCompletion.sameCount / maxPixels) * 100;
                    frameJSON.filter((frame)=>{return frame.time==frameCompletion.ms})[0].visuallyComplete = perc;
                }
                fs.writeFileSync(path.join(outputPath,'frames.json'),JSON.stringify(frameJSON));
                resolve(true);
            })
        })
    })
}