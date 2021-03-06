/**
 * Copyright (c) Dinu SV and other contributors.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class EventConnection{
    constructor(emitterObject, eventName, observerObject, observerCall){
        this.emitterObject = emitterObject
        this.eventName = eventName
        this.observerObject = observerObject
        this.__call = observerCall
    }
}

export class BaseElement{

    constructor(){
        this.id = ''
        this.parent = null
    }

    setParent(parent){
        this.parent = parent
    }

    on(eventName, fn){
        var eventConnection = new EventConnection(this, eventName, null, fn)
        this[eventName].listeners.push(eventConnection)
    }

    completed(){}

    release(){
        //TODO: close all events this object is listening to, and destroy its html if any
    }

    findId(id){
        var p = this
        while ( p && !p.ids ){
            p = p.parent
        }
        if ( p && p.ids.hasOwnProperty(id) ){
            return p.ids[id]
        }
        return null
    }

    static complete(element){
        element.completed()
    }

    static assignChildren(element, children){
        var propertyName = element['__default__']
        element[propertyName] = children
    }

    static assignChildrenAndComplete(element, children){
        BaseElement.assignChildren(element, children)
        BaseElement.complete(element)
    }

    static assignId(newId){
        this.id = newId
    }

    static propertyNames(element){
        var keys = []
        for (let [key, value] of Object.entries(element)) {
            if ( value && typeof value === 'object' && value.hasOwnProperty('expression') && key.startsWith('__') ){
                keys.push(key.substr(2))
            }
        }
        return keys
    }

    static getProperty(obj, name){
        var propMetaName = '__' + name
        return obj[propMetaName].value
    }

    static setProperty(obj, name, newValue){
        var propMetaName = '__' + name
        var pm = obj[propMetaName]
        if ( pm.value !== newValue ){
            if ( pm.bindings ){
                for ( var i = 0; i < pm.bindings.length; ++i ){
                    BaseElement.disconnect(pm.bindings[i])
                }
                pm.bindings = []
            }

            pm.value = newValue;
            if ( pm.event ){
                pm.event.emit()
            }
        }
    }

    static addProperty(element, propertyName, options){
        var propMeta = {
            expression: undefined,
            bindings: [], // events this property listens to
            value: ('value' in options ? options['value'] : undefined)
        }

        var propMetaName = '__' + propertyName

        if ('notify' in options){
            propMeta['event'] = BaseElement.addEvent(element, options['notify'], [])
        }

        var isWritable = 'isWritable' in options ? options['isWritable'] : true
        var isDefault = 'type' in options && options['type'] === 'default'

        element[propMetaName] = propMeta

        if ( isDefault ){
            element['__default__'] = propertyName
        }

        Object.defineProperty(element, propertyName, {
            get: 'get' in options ? options['get'] : function(){ return this[propMetaName].value },
            set: 'set' in options ? options['set'] : function(newValue){
                var pm = this[propMetaName]
                if ( pm.value !== newValue ){
                    if ( pm.bindings ){
                        for ( var i = 0; i < pm.bindings.length; ++i ){
                            BaseElement.disconnect(pm.bindings[i])
                        }
                        pm.bindings = []
                    }

                    if ( isDefault ){
                        if ( pm.value && pm.value.constructor === Array ){
                            for ( var i = 0; i < pm.value.length; ++i ){
                                pm.value[i].parent = null
                            }
                        }
                        if ( newValue.constructor === Array){
                            for ( var i = 0; i < newValue.length; ++i ){
                                newValue[i].parent = this
                            }
                        }
                    }

                    pm.value = newValue;
                    if ( pm.event ){
                        pm.event.emit()
                    }
                }
            },
            enumerable: true,
            isWritable: isWritable
        })

        
    }

    static addEvent(element, eventName, args){
        var eventMeta = {
            listeners: []
        }
        eventMeta['emit'] = function(){
            for( var i = 0; i < this.listeners.length; ++i ){
                this.listeners[i].__call.apply(null, arguments)
            }
        }.bind(eventMeta)

        element[eventName] = eventMeta
        return eventMeta
    }

    static disconnect(eventConnection){
        var index = eventConnection.emitterObject[eventConnection.eventName].listeners.indexOf(eventConnection)
        if ( index !== -1 ){
            eventConnection.emitterObject[eventConnection.eventName].listeners.splice(index, 1)
        }
    }


    static __debugEventBindings(eventBindings, indent, objectIds){
        objectIds = objectIds || []
        indent = indent || ''
        var s = ''
        for ( var i = 0; i < eventBindings.length; ++i ){
            var propName = eventBindings[i].eventName
            propName = propName.substr(0, propName.lastIndexOf('Changed'))

            var objectId = 0
            var objectIdIndex = objectIds.indexOf(eventBindings[i].emitterObject)        
            if ( objectIdIndex !== -1 ){
                objectId = objectIdIndex
            } else {
                objectId = objectIds.length
                objectIds.push(eventBindings[i].emitterObject)
            }
            s += indent + eventBindings[i].emitterObject.constructor.name + '#' + objectId + '.' + propName + '\n'
            if ( eventBindings[i].childEvents ){
                s += BaseElement.__debugEventBindings(eventBindings[i].childEvents, indent + '  ', objectIds)
            }
        }
        return s
    }

    // for [element, ['z', 'a', 'b']] if z changes: [element.z, 'a', 'b']
    static __createBindingFormat(connection){
        var propName = connection.eventName.substr(0, connection.eventName.lastIndexOf('Changed'))
        var element = connection.emitterObject[propName]
        var result = [element]
        if ( connection.childEvents ){
            for ( var i = 0; i < connection.childEvents.length; ++i ){
                result.push(BaseElement.__createBindingFormatRecurse(element, connection.childEvents[i]))
            }
        }
        return result
    }

    static __createBindingFormatRecurse(element, connection){
        var propName = connection.eventName.substr(0, connection.eventName.lastIndexOf('Changed'))
        var nextElement = element[propName]
        if ( connection.childEvents ){
            var result = [propName]
            for ( var i = 0; i < connection.childEvents.length; ++i ){
                result.push(BaseElement.__createBindingFormatRecurse(nextElement, connection.childEvents[i]))
            }
            return result
        } else {
            return propName
        }
    }

    static __collectAllChildEventsFlat(bindingConnection, res){
        for ( var j = 0; j < bindingConnection.length; ++j ){
            res.push(bindingConnection[j])
            if ( bindingConnection[j].childEvents ){
                BaseElement.__collectAllChildEventsFlat(bindingConnection[j].childEvents, res)
            }
        }
    }

    static __createEventBindings(bindings, element, cb, nestCb){
        var result = []
        for ( var i = 0; i < bindings.length; ++i ){
            var r = BaseElement.__createEventBindingsRecurse(bindings[i], element, bindings[i][0], cb, nestCb)
            for ( var j = 0; j < r.length; ++j ){
                result.push(r[j])
            }
            for ( var j = 0; j < r.length; ++j ){
                if ( r[j].childEvents )
                   BaseElement.__collectAllChildEventsFlat(r[j].childEvents, result)
            }
        }
        return result
    }

    // Example: can receive: [element, ['z', 'a', 'b']], and ['z', 'a', 'b'] after
    static __createEventBindingsRecurse(bindings, mainElement, bindingElement, cb, nestCb){
        var result = []
        for ( var i = 1; i < bindings.length; ++i ){ // itereate only properties
            if ( !bindingElement )
                continue
            if ( !(bindingElement instanceof BaseElement) )
                continue

            var bind = bindings[i]
            if ( bind instanceof Array ){
                var nextElement = bindingElement[bind[0]]
                var connection = new EventConnection(bindingElement, bind[0] + 'Changed', mainElement, null)
                connection.basicCallback = cb
                connection.nestedCallback = nestCb
                connection.__call = nestCb.bind(connection)
                connection.childEvents = BaseElement.__createEventBindingsRecurse(bind, mainElement, nextElement, cb, nestCb)
                result.push(connection)
            } else {
                var connection = new EventConnection(bindingElement, bind + 'Changed', mainElement, cb)
                result.push(connection)
            }
        }
        return result
    }

    static assignPropertyExpression(element, propertyName, propertyExpression, bindings){
        var propMeta = element['__' + propertyName]
        propMeta['expression'] = propertyExpression.bind(element)

        var previousBindings = propMeta['bindings']

        for ( var i = 0; i < previousBindings.length; ++i ){
            BaseElement.disconnect(previousBindings[i])
        }

        var bindingEvents = BaseElement.__createEventBindings(
            bindings, 
            element, 
            function(){
                propMeta.value = propMeta['expression']()
                propMeta.event.emit()
            }, 
            function(){
                var bindingFormat = BaseElement.__createBindingFormat(this)

                // reset all child events
                var allChildEvents = []
                BaseElement.__collectAllChildEventsFlat(this.childEvents, allChildEvents)
                for ( var i = 0; i < allChildEvents.length; ++i ){
                    BaseElement.disconnect(allChildEvents[i])
                    var index = propMeta['bindings'].indexOf(allChildEvents[i])
                    propMeta['bindings'].splice(index, 1)
                }
                this.childEvents = []

                // reconfigure the events based on binding format
                var propName = this.eventName.substr(0, this.eventName.lastIndexOf('Changed'))
                this.childEvents = BaseElement.__createEventBindingsRecurse(bindingFormat, element, this.emitterObject[propName], this.basicCallback, this.nestedCallback )

                // add new events to property bindings
                var newChildEvents = []
                BaseElement.__collectAllChildEventsFlat(this.childEvents, newChildEvents)
                for ( var i = 0; i < newChildEvents.length; ++i ){
                    var conn = newChildEvents[i]
                    propMeta['bindings'].push(conn)
                    conn.emitterObject[conn.eventName].listeners.push(conn)
                }

                propMeta.value = propMeta['expression']()
                propMeta.event.emit()
            }
        )

        for ( var i = 0; i < bindingEvents.length; ++i ){
            var conn = bindingEvents[i]
            conn.emitterObject[conn.eventName].listeners.push(conn)
        }
        propMeta['bindings'] = bindingEvents
        propMeta.value = propMeta['expression']()
        if ( propMeta.event ){
            propMeta.event.emit()
        }
    }

}